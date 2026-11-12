import {
	and,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lte,
	type SQL,
	sql,
} from "drizzle-orm";
import { Context, Effect, Layer, Schedule } from "effect";
import {
	issue,
	member,
	notificationSetting,
	organization,
	project,
	report,
	reportMessage,
	user,
	webhookEndpoint,
} from "#/db/schema";
import { AI_PROVIDER_META, type AiProvider } from "#/shared/ai";
import {
	DEFAULT_DIGEST_HOUR,
	NOTIFICATION_META,
	NOTIFICATION_TYPES,
	type NotificationSettingsView,
	type NotificationType,
	REPORTER_REPLY_WINDOW_MINUTES,
} from "#/shared/notifications";
import type { Actor } from "./Access";
import { Database } from "./Database";
import { env } from "./env";
import type { DbError } from "./errors";
import { type Mail, mailEnabled, sendMail } from "./mailer";
import {
	readUnsubscribe,
	signUnsubscribe,
	unsubscribeHeaders,
	unsubscribePageUrl,
} from "./unsubscribe";

type SettingRow = typeof notificationSetting.$inferSelect;

const COLUMN = {
	reporter_replied: "reporterReplied",
	assigned: "assigned",
	regression: "regression",
	triage_digest: "triageDigest",
	ai_key_failing: "aiKeyFailing",
	webhook_failing: "webhookFailing",
} as const satisfies Record<NotificationType, keyof SettingRow>;

/** Whether this person gets this email: their choice, or the default. */
const wants = (
	row: SettingRow | null,
	type: NotificationType,
	isAdmin: boolean,
) => {
	const value = row?.[COLUMN[type]];
	if (value === null || value === undefined)
		return type === "triage_digest" ? isAdmin : true;
	return value;
};

const isAdminRole = (role: string) => role === "owner" || role === "admin";

/** The UTC hour of the triage digest (TRIAGE_DIGEST_HOUR, 0 to 23). */
export const digestHour = () => {
	const value = process.env.TRIAGE_DIGEST_HOUR?.trim();
	const hour = Number(value);
	return value && Number.isInteger(hour) && hour >= 0 && hour <= 23
		? hour
		: DEFAULT_DIGEST_HOUR;
};

const issueUrl = (projectId: string, number: number) =>
	`${env.baseUrl}/p/${projectId}/issues/${number}`;

const quote = (text: string, max = 2000) => {
	const clean = text.trim();
	return `“${clean.length > max ? `${clean.slice(0, max - 1)}…` : clean}”`;
};

const actorName = (actor: Actor) =>
	actor.type === "agent" ? `${actor.name} (agent)` : actor.name;

const DIGEST_ITEMS = 5;
const DAY_MS = 24 * 3600 * 1000;

type Person = {
	userId: string;
	email: string;
	name: string;
	role: string;
	setting: SettingRow | null;
};

/**
 * Emails to team members: when a reporter answers, an issue is assigned to
 * them, a fixed bug comes back, the daily triage digest, and the AI key or a
 * webhook failing. Each person chooses which ones they get; every email can
 * stop its kind in one click. Nothing is sent without SMTP.
 *
 * Callers start these with `inBackground`: a request never waits for them.
 */
export class Notifications extends Context.Service<
	Notifications,
	{
		/** Someone other than the assignee assigned the issue to them. */
		readonly assigned: (
			issueId: string,
			assigneeUserId: string,
			actor: Actor,
		) => Effect.Effect<void, DbError>;
		/** A done bug was reopened because a newer report came in. */
		readonly regressed: (
			issueId: string,
			release: string | null,
			actor: Actor,
		) => Effect.Effect<void, DbError>;
		/** The AI provider keeps refusing the workspace's key. */
		readonly aiKeyFailing: (
			organizationId: string,
			provider: AiProvider,
			status: number,
		) => Effect.Effect<void, DbError>;
		/** A delivery gave up after its retries: owners and admins hear once. */
		readonly webhookFailing: (
			endpointId: string,
			event: string,
			error: string,
		) => Effect.Effect<void, DbError>;
		/**
		 * Emails what reporters wrote, one email per conversation for the
		 * messages of a 10-minute window. Returns the number of conversations.
		 */
		readonly sendReporterMessages: (
			now?: Date,
		) => Effect.Effect<number, DbError>;
		/** The day's triage digests, once per person per UTC day. Returns how many were sent. */
		readonly sendDigests: (now?: Date) => Effect.Effect<number, DbError>;
		readonly settings: (
			userId: string,
		) => Effect.Effect<NotificationSettingsView, DbError>;
		readonly updateSetting: (
			userId: string,
			type: NotificationType,
			on: boolean,
		) => Effect.Effect<NotificationSettingsView, DbError>;
		/** What a token stops, for the confirmation page; null when it is not ours. */
		readonly describeUnsubscribe: (
			token: string,
		) => Effect.Effect<
			| { kind: "team"; label: string }
			| { kind: "report"; project: string; title: string }
			| null,
			DbError
		>;
		/** Applies an unsubscribe link. False when the token is not ours. */
		readonly unsubscribe: (token: string) => Effect.Effect<boolean, DbError>;
	}
>()("tattle/server/Notifications") {
	static readonly layer = Layer.effect(
		Notifications,
		Effect.gen(function* () {
			const database = yield* Database;

			// ---------- Who gets what ----------

			/** Members of the organization (never former ones) with their settings. */
			const members = (organizationId: string, only: SQL) =>
				database
					.query((db) =>
						db
							.select({
								userId: user.id,
								email: user.email,
								name: user.name,
								role: member.role,
								setting: notificationSetting,
							})
							.from(member)
							.innerJoin(user, eq(user.id, member.userId))
							.leftJoin(
								notificationSetting,
								eq(notificationSetting.userId, user.id),
							)
							.where(and(eq(member.organizationId, organizationId), only)),
					)
					.pipe(Effect.map((rows): Person[] => rows));

			const membersById = (organizationId: string, userIds: string[]) =>
				userIds.length === 0
					? Effect.succeed([] as Person[])
					: members(organizationId, inArray(member.userId, userIds));

			const admins = (organizationId: string) =>
				members(organizationId, inArray(member.role, ["owner", "admin"]));

			const keep = (
				people: Person[],
				type: NotificationType,
				actor?: Actor,
			) => {
				const seen = new Set<string>();
				return people.filter((p) => {
					if (seen.has(p.userId)) return false;
					seen.add(p.userId);
					if (actor?.type === "user" && actor.id === p.userId) return false;
					return wants(p.setting, type, isAdminRole(p.role));
				});
			};

			const send = (
				person: Pick<Person, "userId" | "email">,
				type: NotificationType,
				mail: Omit<Mail, "to" | "footer" | "headers">,
			) => {
				const token = signUnsubscribe({
					kind: "team",
					userId: person.userId,
					type,
				});
				return Effect.tryPromise(() =>
					sendMail({
						...mail,
						to: person.email,
						footer: {
							text: `You get this email because “${NOTIFICATION_META[type].label}” is on in your Tattle notification settings.`,
							links: [
								{
									label: "Notification settings",
									url: `${env.baseUrl}/notifications`,
								},
								{
									label: "Unsubscribe from these emails",
									url: unsubscribePageUrl(token),
								},
							],
						},
						headers: unsubscribeHeaders(token),
					}),
				).pipe(
					Effect.catch((error) =>
						Effect.logError(
							`Email "${type}" failed: ${error.cause instanceof Error ? error.cause.message : "unknown error"}`,
						),
					),
				);
			};

			const issueContext = (issueId: string) =>
				database
					.query((db) =>
						db
							.select({
								id: issue.id,
								number: issue.number,
								title: issue.title,
								assigneeType: issue.assigneeType,
								assigneeId: issue.assigneeId,
								projectId: project.id,
								projectName: project.name,
								organizationId: project.organizationId,
							})
							.from(issue)
							.innerJoin(project, eq(project.id, issue.projectId))
							.where(eq(issue.id, issueId)),
					)
					.pipe(Effect.map((rows) => rows[0] ?? null));

			/** The assignee if they are still a member, else nobody. */
			const assigneeOf = (
				ctx: NonNullable<Effect.Success<ReturnType<typeof issueContext>>>,
			) =>
				ctx.assigneeType === "user" && ctx.assigneeId
					? membersById(ctx.organizationId, [ctx.assigneeId])
					: Effect.succeed([] as Person[]);

			// ---------- The emails ----------

			const assigned = Effect.fn("Notifications.assigned")(function* (
				issueId: string,
				assigneeUserId: string,
				actor: Actor,
			) {
				if (!mailEnabled()) return;
				if (actor.type === "user" && actor.id === assigneeUserId) return;
				const ctx = yield* issueContext(issueId);
				// Reassigned since: the newer change has its own email.
				if (
					!ctx ||
					ctx.assigneeType !== "user" ||
					ctx.assigneeId !== assigneeUserId
				)
					return;
				const people = keep(yield* assigneeOf(ctx), "assigned", actor);
				for (const person of people) {
					yield* send(person, "assigned", {
						subject: `Assigned to you: #${ctx.number} ${ctx.title}`,
						text: `${actorName(actor)} assigned you #${ctx.number} “${ctx.title}” in ${ctx.projectName}.`,
						action: {
							label: "Open the issue",
							url: issueUrl(ctx.projectId, ctx.number),
						},
					});
				}
			});

			const regressed = Effect.fn("Notifications.regressed")(function* (
				issueId: string,
				release: string | null,
				actor: Actor,
			) {
				if (!mailEnabled()) return;
				const ctx = yield* issueContext(issueId);
				if (!ctx) return;
				const assignee = yield* assigneeOf(ctx);
				const people = keep(
					assignee.length > 0 ? assignee : yield* admins(ctx.organizationId),
					"regression",
					actor,
				);
				for (const person of people) {
					yield* send(person, "regression", {
						subject: `Regression: #${ctx.number} ${ctx.title}`,
						text: `#${ctx.number} “${ctx.title}” in ${ctx.projectName} was done, and a newer report came in${release ? ` from release ${release}` : ""}. It was reopened and moved to Todo.`,
						action: {
							label: "Open the issue",
							url: issueUrl(ctx.projectId, ctx.number),
						},
					});
				}
			});

			const REFUSAL_MEANING: Record<number, string> = {
				401: "the key is invalid or was revoked",
				402: "the account is out of credit",
				403: "the key is not allowed to use this model",
				429: "the account is over its rate limit or quota",
			};

			const aiKeyFailing = Effect.fn("Notifications.aiKeyFailing")(function* (
				organizationId: string,
				provider: AiProvider,
				status: number,
			) {
				if (!mailEnabled()) return;
				const [org] = yield* database.query((db) =>
					db
						.select({ name: organization.name })
						.from(organization)
						.where(eq(organization.id, organizationId)),
				);
				const people = keep(yield* admins(organizationId), "ai_key_failing");
				const label = AI_PROVIDER_META[provider].label;
				for (const person of people) {
					yield* send(person, "ai_key_failing", {
						subject: "Your AI key for duplicate suggestions stopped working",
						text: `${label} keeps refusing the AI key of ${org?.name ?? "your workspace"}: HTTP ${status}${REFUSAL_MEANING[status] ? `, ${REFUSAL_MEANING[status]}` : ""}.\n\nUntil it works again, duplicates are only suggested for near-identical wording. Check the key, its credit or quota, then press Test.`,
						action: {
							label: "Open the AI settings",
							url: `${env.baseUrl}/agents#duplicates`,
						},
					});
				}
			});

			const webhookFailing = Effect.fn("Notifications.webhookFailing")(
				function* (endpointId: string, event: string, error: string) {
					if (!mailEnabled()) return;
					// Once per outage: cleared by the next successful delivery.
					const [claimed] = yield* database.query((db) =>
						db
							.update(webhookEndpoint)
							.set({ failureNotifiedAt: new Date() })
							.where(
								and(
									eq(webhookEndpoint.id, endpointId),
									isNull(webhookEndpoint.failureNotifiedAt),
								),
							)
							.returning(),
					);
					if (!claimed) return;
					const [p] = yield* database.query((db) =>
						db.select().from(project).where(eq(project.id, claimed.projectId)),
					);
					if (!p) return;
					// The URL of a chat webhook is its secret: show the host only.
					let host = "the endpoint";
					try {
						host = new URL(claimed.url).host;
					} catch {}
					const chat =
						claimed.format === "discord" || claimed.format === "slack";
					const what =
						claimed.format === "discord"
							? "Discord channel"
							: claimed.format === "slack"
								? "Slack channel"
								: "webhook";
					const people = keep(
						yield* admins(p.organizationId),
						"webhook_failing",
					);
					for (const person of people) {
						yield* send(person, "webhook_failing", {
							subject: `A ${what} of ${p.name} keeps failing`,
							text: `Tattle gave up sending ${event} to the ${what} at ${host} after 6 attempts. Last error: ${error.slice(0, 200)}.\n\nLater events are still sent to it. You won't get this email again until a delivery to it works.`,
							action: {
								label: `Open the ${chat ? "channel" : "webhook"} settings`,
								url: `${env.baseUrl}/p/${p.id}/settings#${chat ? "notifications" : "webhooks"}`,
							},
						});
					}
				},
			);

			// ---------- A reporter answered ----------

			const reporterSql = eq(reportMessage.authorType, "reporter");
			const notToldYet = sql`${reportMessage.createdAt} > coalesce(${report.teamNotifiedAt}, '-infinity'::timestamp)`;
			// The team answered after it: they have seen it.
			const unanswered = sql`not exists (select 1 from ${reportMessage} as later where later.report_id = ${reportMessage.reportId} and later.author_type <> 'reporter' and later.created_at > ${reportMessage.createdAt})`;

			const sendReporterMessages = Effect.fn(
				"Notifications.sendReporterMessages",
			)(function* (now: Date = new Date()) {
				if (!mailEnabled()) return 0;
				// Only recent messages: never a backlog after an upgrade or an outage.
				const recent = gt(
					reportMessage.createdAt,
					new Date(now.getTime() - DAY_MS),
				);
				const windowStart = new Date(
					now.getTime() - REPORTER_REPLY_WINDOW_MINUTES * 60_000,
				);
				const due = yield* database.query((db) =>
					db
						.select({ reportId: report.id })
						.from(reportMessage)
						.innerJoin(report, eq(report.id, reportMessage.reportId))
						.where(and(reporterSql, recent, notToldYet, unanswered))
						.groupBy(report.id)
						.having(
							sql`min(${reportMessage.createdAt}) <= ${windowStart.toISOString()}::timestamp`,
						),
				);
				let sent = 0;
				for (const { reportId } of due) {
					const messages = yield* database.query((db) =>
						db
							.select({ id: reportMessage.id, body: reportMessage.body })
							.from(reportMessage)
							.innerJoin(report, eq(report.id, reportMessage.reportId))
							.where(
								and(
									eq(reportMessage.reportId, reportId),
									reporterSql,
									recent,
									notToldYet,
									unanswered,
								),
							)
							.orderBy(reportMessage.createdAt),
					);
					if (messages.length === 0) continue;
					// Marked before sending: a failed email is logged, never resent
					// in a loop. The time is taken in SQL, at full precision.
					const ids = messages.map((m) => m.id);
					const [row] = yield* database.query((db) =>
						db
							.update(report)
							.set({
								teamNotifiedAt: sql`(select max(${reportMessage.createdAt}) from ${reportMessage} where ${inArray(reportMessage.id, ids)})`,
							})
							.where(eq(report.id, reportId))
							.returning({
								issueId: report.issueId,
								reporter: report.reporter,
							}),
					);
					if (!row?.issueId) continue;
					const ctx = yield* issueContext(row.issueId);
					if (!ctx) continue;
					let people = yield* assigneeOf(ctx);
					if (people.length === 0) {
						const repliers = yield* database.query((db) =>
							db
								.selectDistinct({ id: reportMessage.authorId })
								.from(reportMessage)
								.where(
									and(
										eq(reportMessage.reportId, reportId),
										eq(reportMessage.authorType, "user"),
										isNotNull(reportMessage.authorId),
									),
								),
						);
						people = yield* membersById(
							ctx.organizationId,
							repliers.map((r) => r.id as string),
						);
					}
					if (people.length === 0) people = yield* admins(ctx.organizationId);
					people = keep(people, "reporter_replied");
					if (people.length === 0) continue;
					const who = row.reporter?.name?.trim() || "The reporter";
					const several = messages.length > 1;
					for (const person of people) {
						yield* send(person, "reporter_replied", {
							subject: `Reporter answered: #${ctx.number} ${ctx.title}`,
							text: [
								`${who}, who reported #${ctx.number} “${ctx.title}” in ${ctx.projectName}, wrote${several ? ` ${messages.length} messages` : ""}:`,
								...messages.map((m) => quote(m.body)),
								"Written by the reporter, not by your team. Answer from the issue page.",
							].join("\n\n"),
							action: {
								label: "Open the issue",
								url: issueUrl(ctx.projectId, ctx.number),
							},
						});
					}
					sent++;
				}
				return sent;
			});

			// ---------- Daily triage digest ----------

			const sendDigests = Effect.fn("Notifications.sendDigests")(function* (
				now: Date = new Date(),
			) {
				if (!mailEnabled() || now.getUTCHours() < digestHour()) return 0;
				const today = now.toISOString().slice(0, 10);
				const people = yield* database.query((db) =>
					db
						.select({
							userId: user.id,
							email: user.email,
							isAdmin: sql<boolean>`bool_or(${member.role} in ('owner', 'admin'))`,
							setting: notificationSetting,
						})
						.from(member)
						.innerJoin(user, eq(user.id, member.userId))
						.leftJoin(
							notificationSetting,
							eq(notificationSetting.userId, user.id),
						)
						.where(
							sql`${notificationSetting.digestDay} is distinct from ${today}`,
						)
						.groupBy(user.id, notificationSetting.userId),
				);
				let sent = 0;
				for (const person of people) {
					if (!wants(person.setting, "triage_digest", person.isAdmin)) continue;
					// Claimed in a transaction: once per day, even across restarts.
					const since = yield* database.transaction(async (tx) => {
						await tx
							.insert(notificationSetting)
							.values({ userId: person.userId })
							.onConflictDoNothing();
						const [row] = await tx
							.select()
							.from(notificationSetting)
							.where(eq(notificationSetting.userId, person.userId))
							.for("update");
						if (!row || row.digestDay === today) return null;
						await tx
							.update(notificationSetting)
							.set({ digestDay: today, digestCoveredUntil: now })
							.where(eq(notificationSetting.userId, person.userId));
						return row.digestCoveredUntil ?? new Date(now.getTime() - DAY_MS);
					});
					if (!since) continue;
					const fresh = yield* database.query((db) =>
						db
							.select({
								projectId: project.id,
								projectName: project.name,
								number: issue.number,
								title: issue.title,
							})
							.from(issue)
							.innerJoin(project, eq(project.id, issue.projectId))
							.innerJoin(
								member,
								and(
									eq(member.organizationId, project.organizationId),
									eq(member.userId, person.userId),
								),
							)
							.where(
								and(
									eq(issue.status, "triage"),
									gt(issue.createdAt, since),
									lte(issue.createdAt, now),
								),
							)
							.orderBy(project.createdAt, desc(issue.createdAt)),
					);
					if (fresh.length === 0) continue;
					const byProject = new Map<
						string,
						{ name: string; issues: typeof fresh }
					>();
					for (const row of fresh) {
						const entry = byProject.get(row.projectId) ?? {
							name: row.projectName,
							issues: [],
						};
						entry.issues.push(row);
						byProject.set(row.projectId, entry);
					}
					const projects = [...byProject.entries()];
					const [firstId, first] = projects[0] as [
						string,
						{ name: string; issues: typeof fresh },
					];
					yield* send(person, "triage_digest", {
						subject:
							projects.length === 1
								? `Triage: ${fresh.length} new in ${first.name}`
								: `Triage: ${fresh.length} new issues`,
						text: `New since the last digest and waiting in Triage:`,
						lists: projects.map(([projectId, entry]) => ({
							title: `${entry.name}: ${entry.issues.length} new`,
							url: `${env.baseUrl}/p/${projectId}/triage`,
							items: entry.issues.slice(0, DIGEST_ITEMS).map((i) => ({
								label: `#${i.number} ${i.title}`,
								url: issueUrl(projectId, i.number),
							})),
							more:
								entry.issues.length > DIGEST_ITEMS
									? `and ${entry.issues.length - DIGEST_ITEMS} more`
									: undefined,
						})),
						action: {
							label: "Open Triage",
							url: `${env.baseUrl}/p/${firstId}/triage`,
						},
					});
					sent++;
				}
				return sent;
			});

			// ---------- Settings and unsubscribe links ----------

			const settings = Effect.fn("Notifications.settings")(function* (
				userId: string,
			) {
				const [person] = yield* database.query((db) =>
					db
						.select({
							email: user.email,
							setting: notificationSetting,
							isAdmin: sql<boolean>`exists (select 1 from ${member} where ${member.userId} = ${user.id} and ${member.role} in ('owner', 'admin'))`,
						})
						.from(user)
						.leftJoin(
							notificationSetting,
							eq(notificationSetting.userId, user.id),
						)
						.where(eq(user.id, userId)),
				);
				const isAdmin = person?.isAdmin ?? false;
				return {
					isAdmin,
					mailEnabled: mailEnabled(),
					digestHourUtc: digestHour(),
					email: person?.email ?? "",
					settings: Object.fromEntries(
						NOTIFICATION_TYPES.map((type) => [
							type,
							wants(person?.setting ?? null, type, isAdmin),
						]),
					) as Record<NotificationType, boolean>,
				} satisfies NotificationSettingsView;
			});

			const store = (userId: string, type: NotificationType, on: boolean) =>
				database.query((db) =>
					db
						.insert(notificationSetting)
						.values({ userId, [COLUMN[type]]: on })
						.onConflictDoUpdate({
							target: notificationSetting.userId,
							set: { [COLUMN[type]]: on },
						}),
				);

			const updateSetting = Effect.fn("Notifications.updateSetting")(function* (
				userId: string,
				type: NotificationType,
				on: boolean,
			) {
				yield* store(userId, type, on);
				return yield* settings(userId);
			});

			const describeUnsubscribe = Effect.fn(
				"Notifications.describeUnsubscribe",
			)(function* (token: string) {
				const target = readUnsubscribe(token);
				if (!target) return null;
				if (target.kind === "team")
					return {
						kind: "team" as const,
						label: NOTIFICATION_META[target.type].label,
					};
				const [row] = yield* database.query((db) =>
					db
						.select({ message: report.message, project: project.name })
						.from(report)
						.innerJoin(project, eq(project.id, report.projectId))
						.where(eq(report.id, target.reportId)),
				);
				if (!row) return null;
				const firstLine = row.message.trim().split("\n")[0] ?? "";
				return {
					kind: "report" as const,
					project: row.project,
					title:
						firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine,
				};
			});

			const unsubscribe = Effect.fn("Notifications.unsubscribe")(function* (
				token: string,
			) {
				const target = readUnsubscribe(token);
				if (!target) return false;
				if (target.kind === "team") {
					const [exists] = yield* database.query((db) =>
						db
							.select({ id: user.id })
							.from(user)
							.where(eq(user.id, target.userId)),
					);
					if (!exists) return false;
					yield* store(target.userId, target.type, false);
					return true;
				}
				const updated = yield* database.query((db) =>
					db
						.update(report)
						.set({
							emailsStoppedAt: sql`coalesce(${report.emailsStoppedAt}, now())`,
						})
						.where(eq(report.id, target.reportId))
						.returning({ id: report.id }),
				);
				return updated.length > 0;
			});

			// Every minute: reporters' messages whose window is over, and the
			// digests once the hour has come. Off in tests, which call them.
			if (process.env.NODE_ENV !== "test") {
				yield* Effect.suspend(() =>
					Effect.all([sendReporterMessages(), sendDigests()]),
				).pipe(
					Effect.catch((error) =>
						Effect.logError(`Email notifications failed: ${error._tag}`),
					),
					Effect.delay("20 seconds"),
					Effect.repeat(Schedule.spaced("1 minute")),
					Effect.forkScoped,
				);
			}

			return Notifications.of({
				assigned,
				regressed,
				aiKeyFailing,
				webhookFailing,
				sendReporterMessages,
				sendDigests,
				settings,
				updateSetting,
				describeUnsubscribe,
				unsubscribe,
			});
		}),
	);
}
