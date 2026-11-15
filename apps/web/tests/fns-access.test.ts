import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { apiToken, invitation, project, webhookEndpoint } from "#/db/schema";
import * as fns from "#/server/fns";
import { HttpError } from "#/server/runtime";
import {
	createApiToken,
	createProject,
	createWebhookEndpoint,
	createWorkspace,
} from "./helpers/factories";
import {
	requestContext,
	resetRequestContext,
	signInWith,
} from "./helpers/request-context";
import { setupTestDatabase } from "./helpers/runtime";
import { type SignedIn, signedInMember } from "./helpers/session";

vi.mock("@tanstack/react-start", () => import("./helpers/start-mock"));
vi.mock("@tanstack/react-start/server", () => import("./helpers/start-mock"));

setupTestDatabase();
beforeEach(() => resetRequestContext());

/** The HTTP status a server function answered with. */
const statusOf = async (call: Promise<unknown>) => {
	try {
		await call;
		return 200;
	} catch (error) {
		if (error instanceof HttpError) return error.status;
		throw error;
	}
};

const as = (person: SignedIn) => signInWith(person.cookie);

describe("server functions need a dashboard session", () => {
	it("answer 401 without a session cookie", async () => {
		const { org, project: p } = await createWorkspace();
		const calls = [
			() => fns.getWorkspaceFn(),
			() => fns.getProjectFn({ data: { projectId: p.id } }),
			() => fns.listIssuesFn({ data: { projectId: p.id } }),
			() => fns.listMembersFn({ data: { organizationId: org.id } }),
			() => fns.listTokensFn({ data: { organizationId: org.id } }),
			() =>
				fns.createTokenFn({
					data: { organizationId: org.id, name: "x", canWrite: true },
				}),
			() => fns.listWebhooksFn({ data: { projectId: p.id } }),
			() => fns.getNotificationSettingsFn(),
			() => fns.listOAuthAppsFn(),
		];
		for (const call of calls) expect(await statusOf(call())).toBe(401);
	});

	it("refuse an API token, even a write token of the organization", async () => {
		const { org, project: p } = await createWorkspace();
		const { token } = await createApiToken(org.id, { canWrite: true });
		requestContext.headers = new Headers({ authorization: `Bearer ${token}` });
		expect(
			await statusOf(fns.getProjectFn({ data: { projectId: p.id } })),
		).toBe(401);
		expect(
			await statusOf(
				fns.createIssueFn({
					data: { projectId: p.id, type: "bug", title: "Through a token" },
				}),
			),
		).toBe(401);
	});

	it("answer 401 to a forged session cookie", async () => {
		const { project: p } = await createWorkspace();
		signInWith("better-auth.session_token=forged.signature");
		expect(
			await statusOf(fns.getProjectFn({ data: { projectId: p.id } })),
		).toBe(401);
	});
});

describe("a member of one organization", () => {
	const twoWorkspaces = async () => {
		const mine = await createWorkspace();
		const theirs = await createWorkspace();
		const me = await signedInMember(mine.org.id, "owner");
		as(me);
		return { mine, theirs, me };
	};

	it("sees only their own organizations and projects", async () => {
		const { mine } = await twoWorkspaces();
		const workspace = await fns.getWorkspaceFn();
		expect(workspace.organizations.map((o) => o.id)).toEqual([mine.org.id]);
		expect(workspace.projects.map((p) => p.id)).toEqual([mine.project.id]);
		expect(workspace.projects[0]?.triageCount).toBe(0);
	});

	it("cannot read or change another organization's project", async () => {
		const { theirs } = await twoWorkspaces();
		const projectId = theirs.project.id;
		expect(await statusOf(fns.getProjectFn({ data: { projectId } }))).toBe(404);
		expect(await statusOf(fns.listIssuesFn({ data: { projectId } }))).toBe(404);
		expect(
			await statusOf(
				fns.createIssueFn({
					data: { projectId, type: "bug", title: "Planted" },
				}),
			),
		).toBe(404);
		expect(
			await statusOf(
				fns.updateProjectFn({ data: { projectId, allowedOrigins: ["*"] } }),
			),
		).toBe(404);
		expect(
			await statusOf(fns.deleteIssueFn({ data: { projectId, number: 1 } })),
		).toBe(404);
		expect(
			await statusOf(
				fns.pingWebhookFn({ data: { projectId, endpointId: "x" } }),
			),
		).toBe(404);
		const [unchanged] = await db
			.select()
			.from(project)
			.where(eq(project.id, projectId));
		expect(unchanged?.allowedOrigins).toEqual([]);
	});

	it("cannot list, create or revoke another organization's tokens and members", async () => {
		const { theirs } = await twoWorkspaces();
		const organizationId = theirs.org.id;
		expect(
			await statusOf(fns.listMembersFn({ data: { organizationId } })),
		).toBe(403);
		expect(await statusOf(fns.listTokensFn({ data: { organizationId } }))).toBe(
			403,
		);
		expect(
			await statusOf(
				fns.createTokenFn({
					data: { organizationId, name: "Mine now", canWrite: true },
				}),
			),
		).toBe(403);
		expect(
			await statusOf(
				fns.createProjectFn({ data: { organizationId, name: "Squatter" } }),
			),
		).toBe(403);
		expect(
			await statusOf(
				fns.findReporterFn({
					data: { organizationId, query: "a@example.com" },
				}),
			),
		).toBe(403);
		expect(
			await statusOf(fns.getAiSettingsFn({ data: { organizationId } })),
		).toBe(403);
	});

	it("cannot revoke another organization's token through their own organization id", async () => {
		const { mine, theirs } = await twoWorkspaces();
		const { row } = await createApiToken(theirs.org.id);
		await fns.revokeTokenFn({
			data: { organizationId: mine.org.id, tokenId: row.id },
		});
		const [after] = await db
			.select()
			.from(apiToken)
			.where(eq(apiToken.id, row.id));
		expect(after?.revokedAt).toBeNull();
	});

	it("cannot delete another project's webhook through their own project id", async () => {
		const { mine, theirs } = await twoWorkspaces();
		const endpoint = await createWebhookEndpoint(
			theirs.project.id,
			"https://hooks.example.com/theirs",
		);
		await fns.deleteWebhookFn({
			data: { projectId: mine.project.id, endpointId: endpoint.id },
		});
		const rows = await db
			.select()
			.from(webhookEndpoint)
			.where(eq(webhookEndpoint.id, endpoint.id));
		expect(rows).toHaveLength(1);
	});

	it("cannot cancel another organization's invitation through their own organization id", async () => {
		const { mine, theirs } = await twoWorkspaces();
		const other = await signedInMember(theirs.org.id, "owner");
		as(other);
		await fns.inviteMemberFn({
			data: {
				organizationId: theirs.org.id,
				email: "guest@example.com",
				role: "member",
			},
		});
		const [sent] = await db.select().from(invitation);
		const me = await signedInMember(mine.org.id, "owner");
		as(me);
		await fns.revokeInvitationFn({
			data: { organizationId: mine.org.id, invitationId: sent?.id ?? "" },
		});
		const [after] = await db.select().from(invitation);
		expect(after?.status).toBe("pending");
	});
});

describe("owner and admin only actions", () => {
	const roles = async () => {
		const { org, project: p } = await createWorkspace();
		const admin = await signedInMember(org.id, "admin");
		const plain = await signedInMember(org.id, "member");
		return { org, project: p, admin, plain };
	};

	it("are refused to a plain member with 403", async () => {
		const { org, project: p, plain } = await roles();
		as(plain);
		const projectId = p.id;
		const organizationId = org.id;
		const refused = [
			() =>
				fns.setIdentityVerificationFn({ data: { projectId, enabled: true } }),
			() =>
				fns.createWebhookFn({
					data: {
						projectId,
						url: "https://hooks.example.com/x",
						events: [],
						format: "json",
					},
				}),
			() => fns.deleteWebhookFn({ data: { projectId, endpointId: "x" } }),
			() => fns.setGithubEnabledFn({ data: { projectId, enabled: true } }),
			() => fns.regenerateGithubSecretFn({ data: { projectId } }),
			() => fns.deleteProjectFn({ data: { projectId, confirmName: p.name } }),
			() =>
				fns.inviteMemberFn({
					data: { organizationId, email: "x@example.com", role: "admin" },
				}),
			() =>
				fns.revokeInvitationFn({ data: { organizationId, invitationId: "x" } }),
			() =>
				fns.exportReporterFn({
					data: { organizationId, query: "x@example.com" },
				}),
			() =>
				fns.eraseReporterFn({
					data: { organizationId, query: "x@example.com" },
				}),
			() => fns.updateProjectFn({ data: { projectId, name: "Renamed" } }),
			() => fns.updateProjectFn({ data: { projectId, allowedOrigins: ["*"] } }),
			() =>
				fns.updateProjectFn({
					data: { projectId, portalEnabled: true, portalSlug: "mine-now" },
				}),
			() => fns.deleteIssueFn({ data: { projectId, number: 1 } }),
			() => fns.deleteReportFn({ data: { projectId, reportId: "x" } }),
		];
		for (const call of refused) expect(await statusOf(call())).toBe(403);
		const [still] = await db.select().from(project).where(eq(project.id, p.id));
		expect(still?.identitySecret).toBeNull();
		expect(still).toMatchObject({
			name: p.name,
			allowedOrigins: [],
			portalEnabled: false,
		});
		expect(await db.select().from(invitation)).toEqual([]);
	});

	it("tell the dashboard whether the person manages the project", async () => {
		const { project: p, admin, plain } = await roles();
		as(plain);
		expect(
			(await fns.getProjectFn({ data: { projectId: p.id } })).canManage,
		).toBe(false);
		as(admin);
		expect(
			(await fns.getProjectFn({ data: { projectId: p.id } })).canManage,
		).toBe(true);
	});

	it("let a member revoke their own token only, and an admin anyone's", async () => {
		const { org, admin, plain } = await roles();
		const organizationId = org.id;
		as(admin);
		await fns.createTokenFn({
			data: { organizationId, name: "Admin's agent", canWrite: true },
		});
		as(plain);
		await fns.createTokenFn({
			data: { organizationId, name: "My agent", canWrite: true },
		});
		const listed = await fns.listTokensFn({ data: { organizationId } });
		const byName = (name: string) =>
			listed.find((t) => t.name === name) as (typeof listed)[number];
		expect(byName("My agent").canRevoke).toBe(true);
		expect(byName("Admin's agent").canRevoke).toBe(false);

		expect(
			await statusOf(
				fns.revokeTokenFn({
					data: { organizationId, tokenId: byName("Admin's agent").id },
				}),
			),
		).toBe(403);
		await fns.revokeTokenFn({
			data: { organizationId, tokenId: byName("My agent").id },
		});
		expect(
			(await fns.listTokensFn({ data: { organizationId } })).map((t) => t.name),
		).toEqual(["Admin's agent"]);

		await fns.createTokenFn({
			data: { organizationId, name: "Another of mine", canWrite: false },
		});
		as(admin);
		const all = await fns.listTokensFn({ data: { organizationId } });
		expect(all.every((t) => t.canRevoke)).toBe(true);
		for (const t of all)
			await fns.revokeTokenFn({ data: { organizationId, tokenId: t.id } });
		expect(await fns.listTokensFn({ data: { organizationId } })).toEqual([]);
	});

	it("are allowed to an admin", async () => {
		const { project: p, admin } = await roles();
		as(admin);
		const { identitySecret } = await fns.setIdentityVerificationFn({
			data: { projectId: p.id, enabled: true },
		});
		expect(identitySecret).toMatch(/.{20,}/);
		expect(
			await fns.setGithubEnabledFn({
				data: { projectId: p.id, enabled: true },
			}),
		).toEqual({ ok: true });
		const off = await fns.setIdentityVerificationFn({
			data: { projectId: p.id, enabled: false },
		});
		expect(off.identitySecret).toBeNull();
	});

	it("never let a member delete a project, and ask an admin for its exact name", async () => {
		const { project: p, admin } = await roles();
		as(admin);
		const wrong = fns.deleteProjectFn({
			data: { projectId: p.id, confirmName: "web app" },
		});
		await expect(wrong).rejects.toMatchObject({
			status: 400,
			message: expect.stringContaining("Web app"),
		});
		expect(await db.select().from(project)).toHaveLength(1);
		await fns.deleteProjectFn({
			data: { projectId: p.id, confirmName: "  Web app " },
		});
		expect(await db.select().from(project)).toEqual([]);
	});
});

describe("secrets are for owners and admins", () => {
	it("hide the identity secret from members, and never put it in the project", async () => {
		const { org, project: p } = await createWorkspace();
		const admin = await signedInMember(org.id, "admin");
		const plain = await signedInMember(org.id, "member");
		as(admin);
		const { identitySecret } = await fns.setIdentityVerificationFn({
			data: { projectId: p.id, enabled: true },
		});

		expect(
			await fns.getIdentitySettingsFn({ data: { projectId: p.id } }),
		).toEqual({ enabled: true, secret: identitySecret, canManage: true });

		as(plain);
		expect(
			await fns.getIdentitySettingsFn({ data: { projectId: p.id } }),
		).toEqual({ enabled: true, secret: null, canManage: false });
		const seen = await fns.getProjectFn({ data: { projectId: p.id } });
		expect(seen.identityVerification).toBe(true);
		expect(JSON.stringify(seen)).not.toContain(identitySecret as string);
	});

	it("hide the GitHub secret from members", async () => {
		const { org, project: p } = await createWorkspace();
		const admin = await signedInMember(org.id, "owner");
		const plain = await signedInMember(org.id, "member");
		as(admin);
		await fns.setGithubEnabledFn({ data: { projectId: p.id, enabled: true } });
		const forAdmin = await fns.getGithubSettingsFn({
			data: { projectId: p.id },
		});
		expect(forAdmin.canManage).toBe(true);
		expect(forAdmin.secret).toEqual(expect.any(String));

		as(plain);
		const forMember = await fns.getGithubSettingsFn({
			data: { projectId: p.id },
		});
		expect(forMember).toMatchObject({ canManage: false, secret: null });
		expect(JSON.stringify(forMember)).not.toContain(forAdmin.secret as string);
	});

	it("show members a webhook's origin only, without its path or secret", async () => {
		const { org, project: p } = await createWorkspace();
		await createWebhookEndpoint(
			p.id,
			"https://hooks.slack.com/services/T000/B000/very-secret",
			{ format: "slack", secret: "whsec_hidden" },
		);
		const admin = await signedInMember(org.id, "admin");
		const plain = await signedInMember(org.id, "member");

		as(plain);
		const forMember = await fns.listWebhooksFn({ data: { projectId: p.id } });
		expect(forMember.canManage).toBe(false);
		expect(forMember.endpoints).toMatchObject([
			{ url: "https://hooks.slack.com/…", secret: null, format: "slack" },
		]);
		expect(JSON.stringify(forMember)).not.toContain("very-secret");
		expect(JSON.stringify(forMember)).not.toContain("whsec_hidden");

		as(admin);
		const forAdmin = await fns.listWebhooksFn({ data: { projectId: p.id } });
		expect(forAdmin.endpoints).toMatchObject([
			{
				url: "https://hooks.slack.com/services/T000/B000/very-secret",
				secret: "whsec_hidden",
			},
		]);
	});

	it("never return an API token's hash, and show a new token once", async () => {
		const { org } = await createWorkspace();
		const me = await signedInMember(org.id, "member");
		as(me);
		const { token } = await fns.createTokenFn({
			data: { organizationId: org.id, name: "  CI bot ", canWrite: false },
		});
		expect(token).toMatch(/^tat_/);
		const listed = await fns.listTokensFn({ data: { organizationId: org.id } });
		expect(listed).toMatchObject([
			{ name: "CI bot", canWrite: false, prefix: token.slice(0, 12) },
		]);
		expect(JSON.stringify(listed)).not.toContain(token);
		const [stored] = await db.select().from(apiToken);
		expect(stored?.tokenHash).not.toBe(token);
		expect(JSON.stringify(listed)).not.toContain(stored?.tokenHash as string);

		await fns.revokeTokenFn({
			data: { organizationId: org.id, tokenId: listed[0]?.id as string },
		});
		expect(
			await fns.listTokensFn({ data: { organizationId: org.id } }),
		).toEqual([]);
	});
});

describe("projects", () => {
	it("get a slug from their name, unique in the organization", async () => {
		const { org } = await createWorkspace();
		await createProject(org.id, { name: "Other" });
		const me = await signedInMember(org.id, "member");
		as(me);
		const create = (name: string) =>
			fns.createProjectFn({ data: { organizationId: org.id, name } });
		const slugOf = async (id: string) =>
			(await db.select().from(project).where(eq(project.id, id)))[0]?.slug;

		expect(await slugOf((await create("Café Crème — App")).id)).toBe(
			"cafe-creme-app",
		);
		expect(await slugOf((await create("café crème app")).id)).toBe(
			"cafe-creme-app-2",
		);
		expect(await slugOf((await create("Cafe Creme App!")).id)).toBe(
			"cafe-creme-app-3",
		);
		expect(await slugOf((await create("🚀🚀")).id)).toBe("project");
		const long = await create("a".repeat(80));
		expect((await slugOf(long.id))?.length).toBe(40);
	});

	it("refuse an empty or too long name", async () => {
		const { org } = await createWorkspace();
		as(await signedInMember(org.id));
		await expect(
			fns.createProjectFn({ data: { organizationId: org.id, name: "" } }),
		).rejects.toThrow();
		await expect(
			fns.createProjectFn({
				data: { organizationId: org.id, name: "a".repeat(81) },
			}),
		).rejects.toThrow();
	});

	it("take allowed origins as scheme and host only", async () => {
		const { org, project: p } = await createWorkspace();
		as(await signedInMember(org.id, "admin"));
		const update = (allowedOrigins: string[]) =>
			fns.updateProjectFn({ data: { projectId: p.id, allowedOrigins } });

		await update([" https://shop.example.com/ ", "", "http://localhost:5173"]);
		const [saved] = await db.select().from(project).where(eq(project.id, p.id));
		expect(saved?.allowedOrigins).toEqual([
			"https://shop.example.com",
			"http://localhost:5173",
		]);

		for (const bad of [
			"shop.example.com",
			"https://shop.example.com/checkout",
			"ftp://shop.example.com",
			"javascript:alert(1)",
			"https://shop example.com",
		]) {
			await expect(update([bad])).rejects.toMatchObject({ status: 400 });
		}
		await update(["*"]);
	});

	it("take a portal address of 3 to 40 lowercase letters, digits or dashes, once per server", async () => {
		const { org, project: p } = await createWorkspace();
		const other = await createProject(org.id, { portalSlug: "taken-slug" });
		as(await signedInMember(org.id, "admin"));
		const setSlug = (portalSlug: string) =>
			fns.updateProjectFn({ data: { projectId: p.id, portalSlug } });

		await setSlug("  My-Portal ");
		const [saved] = await db.select().from(project).where(eq(project.id, p.id));
		expect(saved?.portalSlug).toBe("my-portal");

		for (const bad of [
			"ab",
			"-starts-with-dash",
			"a".repeat(41),
			"has space",
			"é-accent",
		]) {
			await expect(setSlug(bad)).rejects.toMatchObject({ status: 400 });
		}
		await expect(setSlug("taken-slug")).rejects.toMatchObject({
			status: 400,
			message: "This address is already taken.",
		});
		expect(other.portalSlug).toBe("taken-slug");
	});
});
