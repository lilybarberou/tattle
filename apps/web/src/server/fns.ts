import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";
import * as z from "zod";
import {
	apiToken,
	invitation,
	issue,
	member,
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
	organization,
	project,
	user,
	webhookDelivery,
	webhookEndpoint,
} from "#/db/schema";
import { auth } from "#/lib/auth";
import { passwordPolicy } from "#/lib/password-policy";
import {
	acceptPendingInvitations,
	announceSetupCode,
	signupPolicy,
} from "#/lib/signup";
import { AI_PROVIDERS } from "#/shared/ai";
import {
	ISSUE_STATUSES,
	WEBHOOK_EVENTS,
	WEBHOOK_FORMATS,
} from "#/shared/issues";
import {
	Access,
	actorOf,
	generatePublicKey,
	generateToken,
	type Principal,
} from "./Access";
import { AiSettings } from "./AiSettings";
import { Database } from "./Database";
import { DataLifecycle } from "./DataLifecycle";
import { Duplicates } from "./Duplicates";
import { env } from "./env";
import { type DbError, InvalidInput, NotFound } from "./errors";
import { GitHub } from "./GitHub";
import { Issues } from "./Issues";
import { mailEnabled, sendMail } from "./mailer";
import { Overview } from "./Overview";
import { Portal } from "./Portal";
import { clientIp, limitPortal } from "./rate-limit";
import { run } from "./runtime";
import { Webhooks } from "./Webhooks";

// Helpers are functions (not top-level values) so the client bundle, where
// handler bodies are stripped, can drop every server import.
const principal = () =>
	Effect.suspend(() =>
		Access.use((access) => access.fromHeaders(getRequest().headers)),
	);

const withProject = (projectId: string) =>
	Effect.gen(function* () {
		const p = yield* principal();
		const access = yield* Access;
		const row = yield* access.requireProject(p, projectId);
		return { principal: p, project: row };
	});

const slugify = (name: string) =>
	name
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40) || "project";

const assigneeSchema = z
	.object({ type: z.enum(["user", "agent"]), id: z.string() })
	.nullable();

// Looks the assignee up in the project's organization, so a name always comes
// from the database and never from the client.
const resolveAssignee = (
	organizationId: string,
	assignee: z.infer<typeof assigneeSchema> | undefined,
) =>
	Effect.gen(function* () {
		if (assignee === undefined) return undefined;
		if (assignee === null) return null;
		const database = yield* Database;
		if (assignee.type === "user") {
			const [row] = yield* database.query((db) =>
				db
					.select({ id: user.id, name: user.name })
					.from(member)
					.innerJoin(user, eq(user.id, member.userId))
					.where(
						and(
							eq(member.organizationId, organizationId),
							eq(member.userId, assignee.id),
						),
					),
			);
			if (!row) return yield* new InvalidInput({ message: "Unknown member" });
			return { type: "user" as const, id: row.id, name: row.name };
		}
		const [row] = yield* database.query((db) =>
			db
				.select({ id: apiToken.id, name: apiToken.name })
				.from(apiToken)
				.where(
					and(
						eq(apiToken.organizationId, organizationId),
						eq(apiToken.id, assignee.id),
						isNull(apiToken.revokedAt),
					),
				),
		);
		if (!row) return yield* new InvalidInput({ message: "Unknown agent" });
		return { type: "agent" as const, id: row.id, name: row.name };
	});

// ---------- Session & workspace ----------

export const getSessionFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await auth.api.getSession({
			headers: getRequest().headers,
		});
		// An invited person joins the organization the first time they sign in.
		if (session)
			await acceptPendingInvitations(session.user.id, session.user.email);
		return session
			? {
					user: {
						id: session.user.id,
						name: session.user.name,
						email: session.user.email,
					},
				}
			: null;
	},
);

/** Tells the login page whether to offer account creation. */
export const getSignupStateFn = createServerFn({ method: "GET" })
	.validator(z.object({ email: z.string().optional() }))
	.handler(async ({ data }) => {
		const policy = await signupPolicy(data.email);
		if (policy.firstUser) announceSetupCode();
		return {
			firstUser: policy.firstUser,
			open: policy.open,
			allowed: policy.allowed,
			canResetPassword: mailEnabled(),
			minPasswordLength: passwordPolicy().minLength,
		};
	});

export const getWorkspaceFn = createServerFn({ method: "GET" }).handler(() =>
	run(
		Effect.gen(function* () {
			const p: Principal = yield* principal();
			const database = yield* Database;
			const baseUrl = env.baseUrl;
			const build = env.build;
			if (p.organizationIds.length === 0)
				return { baseUrl, build, organizations: [], projects: [] };
			const [organizations, projects] = yield* Effect.all([
				database.query((db) =>
					db
						.select({
							id: organization.id,
							name: organization.name,
							slug: organization.slug,
						})
						.from(organization)
						.where(inArray(organization.id, [...p.organizationIds])),
				),
				database.query((db) =>
					db
						.select({
							id: project.id,
							name: project.name,
							slug: project.slug,
							organizationId: project.organizationId,
							triageCount: sql<number>`(select count(*) from ${issue} where ${issue.projectId} = ${project.id} and ${issue.status} = 'triage')::int`,
						})
						.from(project)
						.where(inArray(project.organizationId, [...p.organizationIds]))
						.orderBy(project.createdAt),
				),
			]);
			return { baseUrl, build, organizations, projects };
		}),
	),
);

export const createProjectFn = createServerFn({ method: "POST" })
	.validator(
		z.object({ organizationId: z.string(), name: z.string().min(1).max(80) }),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				const access = yield* Access;
				yield* access.requireOrganization(p, data.organizationId);
				const database = yield* Database;
				const base = slugify(data.name);
				const existing = yield* database.query((db) =>
					db
						.select({ slug: project.slug })
						.from(project)
						.where(eq(project.organizationId, data.organizationId)),
				);
				const taken = new Set(existing.map((e) => e.slug));
				let slug = base;
				for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
				const [row] = yield* database.query((db) =>
					db
						.insert(project)
						.values({
							organizationId: data.organizationId,
							name: data.name.trim(),
							slug,
							publicKey: generatePublicKey(),
						})
						.returning({ id: project.id }),
				);
				if (!row)
					return yield* new InvalidInput({
						message: "Project could not be created",
					});
				return row;
			}),
		),
	);

export const getProjectFn = createServerFn({ method: "GET" })
	.validator(z.object({ projectId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const { project: row } = yield* withProject(data.projectId);
				const issues = yield* Issues;
				const counts = yield* issues.counts(row.id);
				return {
					id: row.id,
					name: row.name,
					slug: row.slug,
					organizationId: row.organizationId,
					publicKey: row.publicKey,
					allowedOrigins: row.allowedOrigins,
					portalEnabled: row.portalEnabled,
					portalSlug: row.portalSlug,
					counts,
				};
			}),
		),
	);

export const getOverviewFn = createServerFn({ method: "GET" })
	.validator(z.object({ projectId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				const overview = yield* Overview;
				return yield* overview.get(p, data.projectId);
			}),
		),
	);

export const updateProjectFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			projectId: z.string(),
			name: z.string().min(1).max(80).optional(),
			allowedOrigins: z.array(z.string()).optional(),
			portalEnabled: z.boolean().optional(),
			portalSlug: z.string().optional(),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* withProject(data.projectId);
				const portalSlug = data.portalSlug?.trim().toLowerCase();
				if (
					portalSlug !== undefined &&
					!/^[a-z0-9][a-z0-9-]{2,39}$/.test(portalSlug)
				) {
					return yield* new InvalidInput({
						message:
							"The address takes 3 to 40 lowercase letters, digits or dashes.",
					});
				}
				const origins = data.allowedOrigins
					?.map((o) => o.trim().replace(/\/$/, ""))
					.filter(Boolean);
				for (const origin of origins ?? []) {
					if (origin !== "*" && !/^https?:\/\/[^/\s]+$/.test(origin)) {
						return yield* new InvalidInput({
							message: `"${origin}" is not an origin. Write it as scheme and host only, like https://shop.atelier-nord.fr`,
						});
					}
				}
				const database = yield* Database;
				yield* database
					.query((db) =>
						db
							.update(project)
							.set({
								name: data.name?.trim(),
								allowedOrigins: origins,
								portalEnabled: data.portalEnabled,
								portalSlug,
							})
							.where(eq(project.id, data.projectId)),
					)
					.pipe(
						Effect.catchTag(
							"DbError",
							(error): Effect.Effect<never, InvalidInput | DbError> =>
								String(error.cause).includes("project_portal_slug_unique")
									? Effect.fail(
											new InvalidInput({
												message: "This address is already taken.",
											}),
										)
									: Effect.fail(error),
						),
					);
				return { ok: true };
			}),
		),
	);

// ---------- Issues ----------

const statusSchema = z.enum(ISSUE_STATUSES);

export const listIssuesFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			projectId: z.string(),
			statuses: z.array(statusSchema).optional(),
			type: z.enum(["bug", "feature"]).optional(),
			query: z.string().optional(),
			release: z.string().max(100).optional(),
			limit: z.number().int().min(1).max(200).optional(),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* withProject(data.projectId);
				const issues = yield* Issues;
				return yield* issues.list({ ...data, limit: data.limit ?? 200 });
			}),
		),
	);

export const listReleasesFn = createServerFn({ method: "GET" })
	.validator(z.object({ projectId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* withProject(data.projectId);
				const issues = yield* Issues;
				return yield* issues.releases(data.projectId);
			}),
		),
	);

export const getIssueFn = createServerFn({ method: "GET" })
	.validator(z.object({ projectId: z.string(), number: z.number().int() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* withProject(data.projectId);
				const issues = yield* Issues;
				return yield* issues.get(data.projectId, data.number);
			}),
		),
	);

export const updateIssueFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			projectId: z.string(),
			number: z.number().int(),
			title: z.string().optional(),
			description: z.string().optional(),
			status: statusSchema.exclude(["duplicate"]).optional(),
			priority: z.number().int().min(0).max(4).optional(),
			labels: z.array(z.string()).optional(),
			assignee: assigneeSchema.optional(),
			prUrl: z.string().url().nullable().optional(),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const { principal: p, project: row } = yield* withProject(
					data.projectId,
				);
				const issues = yield* Issues;
				const assignee = yield* resolveAssignee(
					row.organizationId,
					data.assignee,
				);
				return yield* issues.update(
					data.projectId,
					data.number,
					{
						title: data.title,
						description: data.description,
						status: data.status,
						priority: data.priority,
						labels: data.labels,
						assignee,
						prUrl: data.prUrl,
					},
					actorOf(p),
				);
			}),
		),
	);

export const addCommentFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			projectId: z.string(),
			number: z.number().int(),
			body: z.string().min(1),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const { principal: p } = yield* withProject(data.projectId);
				const issues = yield* Issues;
				return yield* issues.addComment(
					data.projectId,
					data.number,
					data.body,
					actorOf(p),
				);
			}),
		),
	);

export const markDuplicateFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			projectId: z.string(),
			number: z.number().int(),
			duplicateOf: z.number().int(),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const { principal: p } = yield* withProject(data.projectId);
				const issues = yield* Issues;
				return yield* issues.markDuplicate(
					data.projectId,
					data.number,
					data.duplicateOf,
					actorOf(p),
				);
			}),
		),
	);

export const createIssueFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			projectId: z.string(),
			type: z.enum(["bug", "feature"]),
			title: z.string().min(1).max(200),
			description: z.string().max(20_000).optional(),
			status: statusSchema.exclude(["duplicate"]).optional(),
			priority: z.number().int().min(0).max(4).optional(),
			labels: z.array(z.string()).optional(),
			assignee: assigneeSchema.optional(),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const { principal: p, project: row } = yield* withProject(
					data.projectId,
				);
				const issues = yield* Issues;
				const actor = actorOf(p);
				const created = yield* issues.create(data.projectId, data, actor);
				const assignee = yield* resolveAssignee(
					row.organizationId,
					data.assignee,
				);
				if (!assignee) return created;
				return yield* issues.update(
					data.projectId,
					created.number,
					{ assignee },
					actor,
				);
			}),
		),
	);

export const searchIssuesFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			projectId: z.string(),
			query: z.string(),
			exclude: z.number().int().optional(),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* withProject(data.projectId);
				const issues = yield* Issues;
				const asNumber = Number(data.query.replace(/^#/, ""));
				const results =
					Number.isInteger(asNumber) && asNumber > 0
						? yield* issues.get(data.projectId, asNumber).pipe(
								Effect.map((detail) => [detail.issue]),
								Effect.catchTag("NotFound", () => Effect.succeed([])),
							)
						: yield* issues.search(data.projectId, data.query, 8);
				return results.filter(
					(i) => i.number !== data.exclude && i.status !== "duplicate",
				);
			}),
		),
	);

export const listAssigneesFn = createServerFn({ method: "GET" })
	.validator(z.object({ projectId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const { principal: p, project: row } = yield* withProject(
					data.projectId,
				);
				const database = yield* Database;
				const [members, agents] = yield* Effect.all([
					database.query((db) =>
						db
							.select({ id: user.id, name: user.name, email: user.email })
							.from(member)
							.innerJoin(user, eq(user.id, member.userId))
							.where(eq(member.organizationId, row.organizationId))
							.orderBy(user.name),
					),
					database.query((db) =>
						db
							.select({ id: apiToken.id, name: apiToken.name })
							.from(apiToken)
							.where(
								and(
									eq(apiToken.organizationId, row.organizationId),
									isNull(apiToken.revokedAt),
									eq(apiToken.canWrite, true),
								),
							)
							.orderBy(apiToken.name),
					),
				]);
				return {
					me: p.kind === "user" ? p.userId : null,
					members,
					agents,
				};
			}),
		),
	);

// ---------- Duplicate suggestions ----------

const issueRef = z.object({ projectId: z.string(), number: z.number().int() });

/** Looks again for a duplicate of one issue, with the AI when it is on. */
export const findDuplicatesFn = createServerFn({ method: "POST" })
	.validator(issueRef)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* withProject(data.projectId);
				const duplicates = yield* Duplicates;
				return yield* duplicates.find(data.projectId, data.number);
			}),
		),
	);

export const dismissDuplicateFn = createServerFn({ method: "POST" })
	.validator(issueRef)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const { principal: p } = yield* withProject(data.projectId);
				const duplicates = yield* Duplicates;
				yield* duplicates.dismiss(data.projectId, data.number, actorOf(p));
			}),
		),
	);

// ---------- Workspace AI ----------

const aiSettingsInput = z.object({
	organizationId: z.string(),
	provider: z.enum(AI_PROVIDERS),
	baseUrl: z.string().max(500).optional(),
	model: z.string().max(200).optional(),
	apiKey: z.string().max(500).optional(),
});

// None of these return the key: AiSettings builds its view field by field.
export const getAiSettingsFn = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				return yield* (yield* AiSettings).view(p, data.organizationId);
			}),
		),
	);

export const saveAiSettingsFn = createServerFn({ method: "POST" })
	.validator(aiSettingsInput.extend({ enabled: z.boolean() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				const { organizationId, ...input } = data;
				return yield* (yield* AiSettings).save(p, organizationId, input);
			}),
		),
	);

export const testAiSettingsFn = createServerFn({ method: "POST" })
	.validator(aiSettingsInput)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				const { organizationId, ...input } = data;
				return yield* (yield* AiSettings).test(p, organizationId, input);
			}),
		),
	);

export const removeAiSettingsFn = createServerFn({ method: "POST" })
	.validator(z.object({ organizationId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				yield* (yield* AiSettings).remove(p, data.organizationId);
			}),
		),
	);

// ---------- Members and invitations ----------

const requireAdmin = (organizationId: string) =>
	Effect.gen(function* () {
		const p = yield* principal();
		if (p.kind !== "user")
			return yield* new InvalidInput({
				message: "Only members can manage members",
			});
		const database = yield* Database;
		const [row] = yield* database.query((db) =>
			db
				.select({ role: member.role })
				.from(member)
				.where(
					and(
						eq(member.organizationId, organizationId),
						eq(member.userId, p.userId),
					),
				),
		);
		if (!row || !["owner", "admin"].includes(row.role))
			return yield* new InvalidInput({
				message: "Only owners and admins can invite people",
			});
		return p;
	});

export const listMembersFn = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				yield* (yield* Access).requireOrganization(p, data.organizationId);
				const database = yield* Database;
				const [members, invites] = yield* Effect.all([
					database.query((db) =>
						db
							.select({
								id: member.id,
								userId: user.id,
								name: user.name,
								email: user.email,
								role: member.role,
								createdAt: member.createdAt,
							})
							.from(member)
							.innerJoin(user, eq(user.id, member.userId))
							.where(eq(member.organizationId, data.organizationId))
							.orderBy(member.createdAt),
					),
					database.query((db) =>
						db
							.select()
							.from(invitation)
							.where(
								and(
									eq(invitation.organizationId, data.organizationId),
									eq(invitation.status, "pending"),
								),
							)
							.orderBy(desc(invitation.createdAt)),
					),
				]);
				const myRole = members.find(
					(m) => p.kind === "user" && m.userId === p.userId,
				)?.role;
				return {
					canManage: myRole === "owner" || myRole === "admin",
					members: members.map((m) => ({
						...m,
						createdAt: m.createdAt.toISOString(),
					})),
					invitations: invites.map((i) => ({
						id: i.id,
						email: i.email,
						role: i.role ?? "member",
						expiresAt: i.expiresAt.toISOString(),
					})),
				};
			}),
		),
	);

export const inviteMemberFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			organizationId: z.string(),
			email: z.string().email(),
			role: z.enum(["member", "admin"]),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* requireAdmin(data.organizationId);
				const database = yield* Database;
				const email = data.email.trim().toLowerCase();
				yield* database.query((db) =>
					db.insert(invitation).values({
						id: crypto.randomUUID(),
						organizationId: data.organizationId,
						email,
						role: data.role,
						status: "pending",
						expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
						inviterId: p.userId,
					}),
				);
				const link = `${env.baseUrl}/login?email=${encodeURIComponent(email)}`;
				const [org] = yield* database.query((db) =>
					db
						.select({ name: organization.name })
						.from(organization)
						.where(eq(organization.id, data.organizationId)),
				);
				const workspace = org?.name ?? "their workspace";
				const emailed = yield* Effect.tryPromise({
					try: () =>
						sendMail({
							to: email,
							subject: `${p.name} invited you to ${workspace} on Tattle`,
							text: `${p.name} invited you to join ${workspace} on Tattle, where your team triages bug reports and feature requests.\n\nCreate your account with this email address (${email}) within 7 days.`,
							action: { label: "Accept the invitation", url: link },
						}),
					catch: (cause) => cause,
				}).pipe(
					Effect.tapError((cause) =>
						Effect.logError("Invitation email failed", cause),
					),
					Effect.orElseSucceed(() => false),
				);
				return { link, emailed };
			}),
		),
	);

export const revokeInvitationFn = createServerFn({ method: "POST" })
	.validator(z.object({ organizationId: z.string(), invitationId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* requireAdmin(data.organizationId);
				const database = yield* Database;
				yield* database.query((db) =>
					db
						.update(invitation)
						.set({ status: "canceled" })
						.where(
							and(
								eq(invitation.id, data.invitationId),
								eq(invitation.organizationId, data.organizationId),
							),
						),
				);
				return { ok: true };
			}),
		),
	);

// ---------- API tokens (organization level) ----------

export const listTokensFn = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				yield* (yield* Access).requireOrganization(p, data.organizationId);
				const database = yield* Database;
				const rows = yield* database.query((db) =>
					db
						.select()
						.from(apiToken)
						.where(
							and(
								eq(apiToken.organizationId, data.organizationId),
								isNull(apiToken.revokedAt),
							),
						)
						.orderBy(desc(apiToken.createdAt)),
				);
				return rows.map((r) => ({
					id: r.id,
					name: r.name,
					prefix: r.prefix,
					canWrite: r.canWrite,
					lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
					createdAt: r.createdAt.toISOString(),
				}));
			}),
		),
	);

export const createTokenFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1).max(60),
			canWrite: z.boolean(),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				if (p.kind !== "user")
					return yield* new InvalidInput({
						message: "Only members can create tokens",
					});
				yield* (yield* Access).requireOrganization(p, data.organizationId);
				const database = yield* Database;
				const generated = generateToken();
				yield* database.query((db) =>
					db.insert(apiToken).values({
						organizationId: data.organizationId,
						name: data.name.trim(),
						prefix: generated.prefix,
						tokenHash: generated.hash,
						canWrite: data.canWrite,
						createdById: p.userId,
					}),
				);
				// Shown once; only the hash is stored.
				return { token: generated.token };
			}),
		),
	);

export const revokeTokenFn = createServerFn({ method: "POST" })
	.validator(z.object({ organizationId: z.string(), tokenId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				yield* (yield* Access).requireOrganization(p, data.organizationId);
				const database = yield* Database;
				yield* database.query((db) =>
					db
						.update(apiToken)
						.set({ revokedAt: new Date() })
						.where(
							and(
								eq(apiToken.id, data.tokenId),
								eq(apiToken.organizationId, data.organizationId),
							),
						),
				);
				return { ok: true };
			}),
		),
	);

// ---------- Webhooks ----------

export const listWebhooksFn = createServerFn({ method: "GET" })
	.validator(z.object({ projectId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* withProject(data.projectId);
				const database = yield* Database;
				const endpoints = yield* database.query((db) =>
					db
						.select()
						.from(webhookEndpoint)
						.where(eq(webhookEndpoint.projectId, data.projectId))
						.orderBy(webhookEndpoint.createdAt),
				);
				const deliveries =
					endpoints.length === 0
						? []
						: yield* database.query((db) =>
								db
									.select()
									.from(webhookDelivery)
									.where(
										inArray(
											webhookDelivery.endpointId,
											endpoints.map((e) => e.id),
										),
									)
									.orderBy(desc(webhookDelivery.createdAt))
									.limit(20),
							);
				return {
					events: WEBHOOK_EVENTS,
					endpoints: endpoints.map((e) => ({
						id: e.id,
						url: e.url,
						format: e.format,
						secret: e.secret,
						events: e.events,
						active: e.active,
					})),
					deliveries: deliveries.map((d) => ({
						id: d.id,
						endpointId: d.endpointId,
						event: d.event,
						status: d.status,
						attempts: d.attempts,
						responseStatus: d.responseStatus,
						lastError: d.lastError,
						createdAt: d.createdAt.toISOString(),
					})),
				};
			}),
		),
	);

export const createWebhookFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			projectId: z.string(),
			url: z.string().url(),
			events: z.array(z.enum(WEBHOOK_EVENTS)),
			format: z.enum(WEBHOOK_FORMATS).default("json"),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* withProject(data.projectId);
				const database = yield* Database;
				const [row] = yield* database.query((db) =>
					db
						.insert(webhookEndpoint)
						.values({
							projectId: data.projectId,
							url: data.url,
							events: data.events,
							format: data.format,
							secret: `whsec_${generateToken().token.slice(4)}`,
						})
						.returning({ id: webhookEndpoint.id }),
				);
				if (!row)
					return yield* new NotFound({
						message: "Webhook could not be created",
					});
				return row;
			}),
		),
	);

export const deleteWebhookFn = createServerFn({ method: "POST" })
	.validator(z.object({ projectId: z.string(), endpointId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* withProject(data.projectId);
				const database = yield* Database;
				yield* database.query((db) =>
					db
						.delete(webhookEndpoint)
						.where(
							and(
								eq(webhookEndpoint.id, data.endpointId),
								eq(webhookEndpoint.projectId, data.projectId),
							),
						),
				);
				return { ok: true };
			}),
		),
	);

export const pingWebhookFn = createServerFn({ method: "POST" })
	.validator(z.object({ projectId: z.string(), endpointId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* withProject(data.projectId);
				const webhooks = yield* Webhooks;
				return yield* webhooks.ping(data.endpointId);
			}),
		),
	);

// ---------- Deleting data ----------

const requireProjectAdmin = (projectId: string) =>
	Effect.gen(function* () {
		const { project: row } = yield* withProject(projectId);
		yield* requireAdmin(row.organizationId);
		return row;
	});

// ---------- GitHub: merged pull requests move issues to Done ----------

const isProjectAdmin = (organizationId: string) =>
	requireAdmin(organizationId).pipe(
		Effect.as(true),
		Effect.catchTag("InvalidInput", () => Effect.succeed(false)),
	);

/** Everyone sees whether it is on; only owners and admins see the secret. */
export const getGithubSettingsFn = createServerFn({ method: "GET" })
	.validator(z.object({ projectId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const { project: row } = yield* withProject(data.projectId);
				const canManage = yield* isProjectAdmin(row.organizationId);
				const settings = yield* (yield* GitHub).settings(row.id);
				return {
					...settings,
					secret: canManage ? settings.secret : null,
					canManage,
				};
			}),
		),
	);

export const setGithubEnabledFn = createServerFn({ method: "POST" })
	.validator(z.object({ projectId: z.string(), enabled: z.boolean() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const row = yield* requireProjectAdmin(data.projectId);
				yield* (yield* GitHub).setEnabled(row.id, data.enabled);
				return { ok: true };
			}),
		),
	);

export const regenerateGithubSecretFn = createServerFn({ method: "POST" })
	.validator(z.object({ projectId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const row = yield* requireProjectAdmin(data.projectId);
				yield* (yield* GitHub).regenerateSecret(row.id);
				return { ok: true };
			}),
		),
	);

export const deleteProjectFn = createServerFn({ method: "POST" })
	.validator(z.object({ projectId: z.string(), confirmName: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const row = yield* requireProjectAdmin(data.projectId);
				if (data.confirmName.trim() !== row.name) {
					return yield* new InvalidInput({
						message: `Type the project's name, “${row.name}”, to confirm.`,
					});
				}
				const lifecycle = yield* DataLifecycle;
				yield* lifecycle.deleteProject(row.id);
				return { ok: true };
			}),
		),
	);

export const deleteReportFn = createServerFn({ method: "POST" })
	.validator(z.object({ projectId: z.string(), reportId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const { principal: p } = yield* withProject(data.projectId);
				const lifecycle = yield* DataLifecycle;
				yield* lifecycle.deleteReport(
					data.projectId,
					data.reportId,
					actorOf(p),
				);
				return { ok: true };
			}),
		),
	);

export const deleteIssueFn = createServerFn({ method: "POST" })
	.validator(z.object({ projectId: z.string(), number: z.number().int() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* withProject(data.projectId);
				const lifecycle = yield* DataLifecycle;
				yield* lifecycle.deleteIssue(data.projectId, data.number);
				return { ok: true };
			}),
		),
	);

// ---------- Personal data (GDPR access and erasure) ----------

const personQuery = z.object({
	organizationId: z.string(),
	query: z.string().trim().min(1).max(320),
});

export const getPrivacySettingsFn = createServerFn({ method: "GET" }).handler(
	() => {
		const days = Number(process.env.REPORT_RETENTION_DAYS);
		return { retentionDays: Number.isInteger(days) && days > 0 ? days : null };
	},
);

export const findReporterFn = createServerFn({ method: "GET" })
	.validator(personQuery)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				yield* (yield* Access).requireOrganization(p, data.organizationId);
				const lifecycle = yield* DataLifecycle;
				return yield* lifecycle.findReporter(data.organizationId, data.query);
			}),
		),
	);

export const exportReporterFn = createServerFn({ method: "POST" })
	.validator(personQuery)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* requireAdmin(data.organizationId);
				const lifecycle = yield* DataLifecycle;
				const exported = yield* lifecycle.exportReporter(
					data.organizationId,
					data.query,
				);
				return JSON.stringify(exported, null, 2);
			}),
		),
	);

export const eraseReporterFn = createServerFn({ method: "POST" })
	.validator(personQuery)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* requireAdmin(data.organizationId);
				const lifecycle = yield* DataLifecycle;
				return yield* lifecycle.eraseReporter(data.organizationId, data.query);
			}),
		),
	);

// ---------- Public feature-request portal (no sign-in) ----------

const VOTER_COOKIE = "tattle_voter";

/** A random id in a cookie tells one visitor's votes apart; nothing else is kept. */
const voterKey = (create: boolean) => {
	const existing = getCookie(VOTER_COOKIE);
	if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
	if (!create) return null;
	const key = randomBytes(18).toString("base64url");
	setCookie(VOTER_COOKIE, key, {
		httpOnly: true,
		sameSite: "lax",
		secure: env.baseUrl.startsWith("https://"),
		path: "/",
		maxAge: 60 * 60 * 24 * 365 * 2,
	});
	return key;
};

const portalLimit = () => {
	const limit = limitPortal(clientIp());
	return limit.ok
		? Effect.void
		: Effect.fail(
				new InvalidInput({
					message: "Too many actions. Try again in a few minutes.",
				}),
			);
};

export const getPortalFn = createServerFn({ method: "GET" })
	.validator(z.object({ slug: z.string() }))
	.handler(({ data }) =>
		run(Portal.use((portal) => portal.get(data.slug, voterKey(false)))),
	);

export const portalVoteFn = createServerFn({ method: "POST" })
	.validator(z.object({ slug: z.string(), number: z.number().int() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* portalLimit();
				const portal = yield* Portal;
				return yield* portal.toggleVote(
					data.slug,
					data.number,
					voterKey(true) as string,
				);
			}),
		),
	);

export const portalNotifyFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			slug: z.string(),
			number: z.number().int(),
			email: z.string().email(),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* portalLimit();
				const key = voterKey(false);
				if (!key) return yield* new InvalidInput({ message: "Vote first" });
				const portal = yield* Portal;
				yield* portal.setVoteEmail(data.slug, data.number, key, data.email);
				return { ok: true };
			}),
		),
	);

export const portalSuggestFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			slug: z.string(),
			title: z.string().trim().min(4).max(140),
			description: z.string().trim().max(4000).optional(),
			email: z.string().email().optional().or(z.literal("")),
		}),
	)
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				yield* portalLimit();
				const portal = yield* Portal;
				return yield* portal.suggest(
					data.slug,
					{
						title: data.title,
						description: data.description,
						email: data.email || undefined,
					},
					voterKey(true) as string,
				);
			}),
		),
	);

// ---------- Apps connected over OAuth (MCP clients) ----------

export const getOAuthClientNameFn = createServerFn({ method: "GET" })
	.validator(z.object({ clientId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const database = yield* Database;
				const [row] = yield* database.query((db) =>
					db
						.select({ name: oauthClient.name, uri: oauthClient.uri })
						.from(oauthClient)
						.where(eq(oauthClient.clientId, data.clientId)),
				);
				return { name: row?.name ?? null, uri: row?.uri ?? null };
			}),
		),
	);

export const listOAuthAppsFn = createServerFn({ method: "GET" }).handler(() =>
	run(
		Effect.gen(function* () {
			const p = yield* principal();
			if (p.kind !== "user") return [];
			const database = yield* Database;
			const rows = yield* database.query((db) =>
				db
					.select({
						clientId: oauthConsent.clientId,
						name: oauthClient.name,
						uri: oauthClient.uri,
						scopes: oauthConsent.scopes,
						connectedAt: oauthConsent.createdAt,
					})
					.from(oauthConsent)
					.innerJoin(
						oauthClient,
						eq(oauthClient.clientId, oauthConsent.clientId),
					)
					.where(eq(oauthConsent.userId, p.userId))
					.orderBy(desc(oauthConsent.createdAt)),
			);
			return rows.map((r) => ({
				...r,
				connectedAt: r.connectedAt.toISOString(),
			}));
		}),
	),
);

export const revokeOAuthAppFn = createServerFn({ method: "POST" })
	.validator(z.object({ clientId: z.string() }))
	.handler(({ data }) =>
		run(
			Effect.gen(function* () {
				const p = yield* principal();
				if (p.kind !== "user")
					return yield* new InvalidInput({ message: "Sign in first" });
				const database = yield* Database;
				yield* database.transaction(async (tx) => {
					const mine = and(
						eq(oauthConsent.userId, p.userId),
						eq(oauthConsent.clientId, data.clientId),
					);
					await tx.delete(oauthConsent).where(mine);
					await tx
						.delete(oauthRefreshToken)
						.where(
							and(
								eq(oauthRefreshToken.userId, p.userId),
								eq(oauthRefreshToken.clientId, data.clientId),
							),
						);
					await tx
						.delete(oauthAccessToken)
						.where(
							and(
								eq(oauthAccessToken.userId, p.userId),
								eq(oauthAccessToken.clientId, data.clientId),
							),
						);
				});
				return { ok: true };
			}),
		),
	);
