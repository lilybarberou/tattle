import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Context, Effect, Layer } from "effect";
import { issue, project, report, reportMessage } from "#/db/schema";
import {
	MAX_MESSAGE_LENGTH,
	type ReporterStatus,
	reporterStatus,
} from "#/shared/issues";
import type { Actor } from "./Access";
import { inBackground } from "./background";
import { Database } from "./Database";
import { env } from "./env";
import { type DbError, InvalidInput, NotFound } from "./errors";
import { originAllowed } from "./Ingest";
import {
	issueDto,
	type MessageDto,
	messageDto,
	titleFromMessage,
} from "./Issues";
import { mailEnabled, sendMail } from "./mailer";
import {
	hashReporterKey,
	identityVerified,
	REPORTER_KEY_PATTERN,
} from "./reporter-identity";
import { reporterUnsubscribe } from "./unsubscribe";
import { Webhooks } from "./Webhooks";

// ---------- Who is asking ----------

/**
 * What the widget sends to follow its reports: the project's public key, the
 * device's reporter key, and the signed-in user with their identity hash.
 * Every part is optional except the project key; nothing here is trusted
 * until it is checked against the database.
 */
export type ReporterAuth = {
	projectKey: string;
	origin: string | null;
	reporterKey?: string | null;
	userId?: string | null;
	userHash?: string | null;
};

// ---------- Signed links in emails ----------

const LINK_TTL_SECONDS = 30 * 24 * 3600;

const linkSignature = (reportId: string, expires: number) =>
	createHmac(
		"sha256",
		createHmac("sha256", env.secret).update("tattle:thread-link").digest(),
	)
		.update(`${reportId}.${expires}`)
		.digest("base64url");

/** A token for the public conversation page of one report, valid 30 days. */
export const signThreadLink = (
	reportId: string,
	expiresAt = Date.now() + LINK_TTL_SECONDS * 1000,
) => {
	const expires = Math.floor(expiresAt / 1000);
	return `${reportId}.${expires}.${linkSignature(reportId, expires)}`;
};

/** The report a token opens, "expired", or null when it was not signed by us. */
export const readThreadLink = (
	token: string,
): { reportId: string } | "expired" | null => {
	const [reportId, expiresText, signature, ...rest] = token.split(".");
	if (!reportId || !expiresText || !signature || rest.length > 0) return null;
	const expires = Number(expiresText);
	if (!Number.isInteger(expires)) return null;
	const expected = Buffer.from(linkSignature(reportId, expires));
	const given = Buffer.from(signature);
	if (expected.length !== given.length || !timingSafeEqual(expected, given))
		return null;
	if (expires < Date.now() / 1000) return "expired";
	return { reportId };
};

export const threadLinkUrl = (token: string) =>
	`${env.baseUrl}/thread/${token}`;

// ---------- What the reporter sees ----------

export type ReporterMessage = {
	id: string;
	from: "team" | "reporter";
	/** The team member's or agent's name; null for the reporter's own messages. */
	name: string | null;
	body: string;
	createdAt: string;
};

export type ReporterReportSummary = {
	id: string;
	type: "bug" | "feature";
	/** The reporter's own words, never the team's issue title. */
	title: string;
	status: ReporterStatus;
	/** Team messages the reporter has not read yet. */
	unread: number;
	createdAt: string;
	/** The newest message, or the report itself. */
	updatedAt: string;
};

export type ReporterThread = {
	id: string;
	type: "bug" | "feature";
	title: string;
	message: string;
	status: ReporterStatus;
	createdAt: string;
	messages: ReporterMessage[];
};

const toReporterMessage = (row: typeof reportMessage.$inferSelect) => ({
	id: row.id,
	from:
		row.authorType === "reporter" ? ("reporter" as const) : ("team" as const),
	name: row.authorType === "reporter" ? null : row.authorName,
	body: row.body,
	createdAt: row.createdAt.toISOString(),
});

const original = alias(issue, "original_issue");

const cleanBody = (body: string) => {
	const text = body.trim();
	if (!text)
		return Effect.fail(new InvalidInput({ message: "Write a message first" }));
	if (text.length > MAX_MESSAGE_LENGTH)
		return Effect.fail(
			new InvalidInput({
				message: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters`,
			}),
		);
	return Effect.succeed(text);
};

const notFound = () => new NotFound({ message: "Report not found" });

/**
 * Conversations between the team and the people who sent reports. Reporters
 * reach theirs from the widget (with the device's reporter key or a verified
 * user id) or from the signed link in a reply email; the team from the issue
 * page and MCP.
 */
export class Conversations extends Context.Service<
	Conversations,
	{
		readonly listMine: (
			auth: ReporterAuth,
		) => Effect.Effect<
			{ reports: ReporterReportSummary[]; unread: number },
			InvalidInput | NotFound | DbError
		>;
		readonly getMine: (
			auth: ReporterAuth,
			reportId: string,
		) => Effect.Effect<ReporterThread, InvalidInput | NotFound | DbError>;
		readonly postMine: (
			auth: ReporterAuth,
			reportId: string,
			body: string,
		) => Effect.Effect<ReporterMessage, InvalidInput | NotFound | DbError>;
		readonly markMineRead: (
			auth: ReporterAuth,
			reportId: string,
		) => Effect.Effect<void, InvalidInput | NotFound | DbError>;
		/** The page behind an email link; fails with NotFound for a forged token. */
		readonly openLink: (
			token: string,
		) => Effect.Effect<
			| { expired: true }
			| { expired: false; project: string; thread: ReporterThread },
			NotFound | DbError
		>;
		readonly postFromLink: (
			token: string,
			body: string,
		) => Effect.Effect<ReporterMessage, InvalidInput | NotFound | DbError>;
		readonly markLinkRead: (
			token: string,
		) => Effect.Effect<void, NotFound | DbError>;
		/** A team member or an agent answers the reporter. */
		readonly reply: (
			projectId: string,
			reportId: string,
			body: string,
			actor: Actor,
		) => Effect.Effect<MessageDto, InvalidInput | NotFound | DbError>;
	}
>()("tattle/server/Conversations") {
	static readonly layer = Layer.effect(
		Conversations,
		Effect.gen(function* () {
			const database = yield* Database;
			const webhooks = yield* Webhooks;

			/**
			 * The reports this caller may see. While the project verifies
			 * identities, a report sent under a verified identity belongs to that
			 * user only, on any device (a missing or wrong hash, e.g. while a new
			 * secret rolls out, opens none of them), and any other report belongs
			 * to the device that sent it. With verification off, the device sees
			 * every report it sent, verified or not. An unverified user id gives
			 * nothing.
			 */
			const resolve = Effect.fn("Conversations.resolve")(function* (
				auth: ReporterAuth,
			) {
				const [row] = yield* database.query((db) =>
					db
						.select({
							id: project.id,
							allowedOrigins: project.allowedOrigins,
							identitySecret: project.identitySecret,
						})
						.from(project)
						.where(eq(project.publicKey, auth.projectKey)),
				);
				if (!row)
					return yield* new NotFound({ message: "Unknown project key" });
				if (!originAllowed(row.allowedOrigins, auth.origin))
					return yield* new InvalidInput({
						message: "This origin is not allowed for this project",
					});
				const keyHash =
					auth.reporterKey && REPORTER_KEY_PATTERN.test(auth.reporterKey)
						? hashReporterKey(auth.reporterKey)
						: null;
				const userId = identityVerified(
					row.identitySecret,
					auth.userId,
					auth.userHash,
				)
					? (auth.userId as string)
					: null;
				const access: SQL[] = [];
				if (userId) access.push(eq(report.verifiedUserId, userId));
				if (keyHash)
					access.push(
						row.identitySecret
							? (and(
									eq(report.reporterKeyHash, keyHash),
									isNull(report.verifiedUserId),
								) as SQL)
							: eq(report.reporterKeyHash, keyHash),
					);
				return {
					projectId: row.id,
					condition:
						access.length === 0
							? null
							: and(eq(report.projectId, row.id), or(...access)),
				};
			});

			const unreadSql = sql<number>`(select count(*) from ${reportMessage} where ${reportMessage.reportId} = ${report.id} and ${reportMessage.authorType} <> 'reporter' and ${reportMessage.readAt} is null)::int`;
			// Read like the created_at column, so the time stays UTC.
			const lastActivitySql =
				sql<Date>`greatest(${report.createdAt}, (select max(${reportMessage.createdAt}) from ${reportMessage} where ${reportMessage.reportId} = ${report.id}))`.mapWith(
					report.createdAt,
				);

			const statusOf = (
				status: (typeof issue.$inferSelect)["status"] | null,
				originalStatus: (typeof issue.$inferSelect)["status"] | null,
			): ReporterStatus =>
				status === "duplicate" && originalStatus
					? reporterStatus(originalStatus)
					: status
						? reporterStatus(status)
						: "received";

			const listMine = Effect.fn("Conversations.listMine")(function* (
				auth: ReporterAuth,
			) {
				const { condition } = yield* resolve(auth);
				if (!condition) return { reports: [], unread: 0 };
				const rows = yield* database.query((db) =>
					db
						.select({
							id: report.id,
							type: report.type,
							message: report.message,
							createdAt: report.createdAt,
							status: issue.status,
							originalStatus: original.status,
							unread: unreadSql,
							updatedAt: lastActivitySql,
						})
						.from(report)
						.leftJoin(issue, eq(issue.id, report.issueId))
						.leftJoin(original, eq(original.id, issue.duplicateOfId))
						.where(condition)
						.orderBy(desc(lastActivitySql))
						.limit(50),
				);
				const reports = rows.map(
					(r): ReporterReportSummary => ({
						id: r.id,
						type: r.type,
						title: titleFromMessage(r.message),
						status: statusOf(r.status, r.originalStatus),
						unread: r.unread,
						createdAt: r.createdAt.toISOString(),
						updatedAt: r.updatedAt.toISOString(),
					}),
				);
				return {
					reports,
					unread: reports.reduce((sum, r) => sum + r.unread, 0),
				};
			});

			const findReport = (condition: SQL, reportId: string) =>
				database
					.query((db) =>
						db
							.select({
								report,
								status: issue.status,
								originalStatus: original.status,
								issue,
							})
							.from(report)
							.leftJoin(issue, eq(issue.id, report.issueId))
							.leftJoin(original, eq(original.id, issue.duplicateOfId))
							.where(and(condition, eq(report.id, reportId))),
					)
					.pipe(
						Effect.flatMap(([row]) =>
							row ? Effect.succeed(row) : Effect.fail(notFound()),
						),
					);

			const threadOf = Effect.fn("Conversations.threadOf")(function* (
				row: Effect.Success<ReturnType<typeof findReport>>,
			) {
				const messages = yield* database.query((db) =>
					db
						.select()
						.from(reportMessage)
						.where(eq(reportMessage.reportId, row.report.id))
						.orderBy(asc(reportMessage.createdAt)),
				);
				return {
					id: row.report.id,
					type: row.report.type,
					title: titleFromMessage(row.report.message),
					message: row.report.message,
					status: statusOf(row.status, row.originalStatus),
					createdAt: row.report.createdAt.toISOString(),
					messages: messages.map(toReporterMessage),
				} satisfies ReporterThread;
			});

			const mine = Effect.fn("Conversations.mine")(function* (
				auth: ReporterAuth,
				reportId: string,
			) {
				const { condition } = yield* resolve(auth);
				if (!condition) return yield* notFound();
				return yield* findReport(condition, reportId);
			});

			const touchIssue = (issueId: string | null) =>
				issueId
					? database.query((db) =>
							db
								.update(issue)
								.set({ updatedAt: new Date() })
								.where(eq(issue.id, issueId)),
						)
					: Effect.void;

			const insertMessage = Effect.fn("Conversations.insertMessage")(function* (
				row: Effect.Success<ReturnType<typeof findReport>>,
				values: {
					authorType: "user" | "agent" | "reporter";
					authorId: string | null;
					authorName: string;
					body: string;
				},
			) {
				const [created] = yield* database.query((db) =>
					db
						.insert(reportMessage)
						.values({ reportId: row.report.id, ...values })
						.returning(),
				);
				if (!created)
					return yield* new InvalidInput({
						message: "The message could not be saved",
					});
				yield* touchIssue(row.report.issueId);
				const dto = messageDto(created);
				yield* webhooks.emit(row.report.projectId, "message.created", {
					issue: row.issue ? issueDto(row.issue) : null,
					report: {
						id: row.report.id,
						message: row.report.message,
						reporter: row.report.reporter,
					},
					message: dto,
				});
				return created;
			});

			const postAsReporter = (
				row: Effect.Success<ReturnType<typeof findReport>>,
				body: string,
			) =>
				Effect.gen(function* () {
					const text = yield* cleanBody(body);
					const reporter = row.report.reporter;
					const created = yield* insertMessage(row, {
						authorType: "reporter",
						authorId: row.report.verifiedUserId ?? reporter?.id ?? null,
						authorName: reporter?.name || reporter?.email || "Reporter",
						body: text,
					});
					return toReporterMessage(created);
				});

			const markRead = (reportId: string) =>
				database.query((db) =>
					db
						.update(reportMessage)
						.set({ readAt: new Date() })
						.where(
							and(
								eq(reportMessage.reportId, reportId),
								ne(reportMessage.authorType, "reporter"),
								isNull(reportMessage.readAt),
							),
						),
				);

			const getMine = Effect.fn("Conversations.getMine")(function* (
				auth: ReporterAuth,
				reportId: string,
			) {
				return yield* threadOf(yield* mine(auth, reportId));
			});

			const postMine = Effect.fn("Conversations.postMine")(function* (
				auth: ReporterAuth,
				reportId: string,
				body: string,
			) {
				return yield* postAsReporter(yield* mine(auth, reportId), body);
			});

			const markMineRead = Effect.fn("Conversations.markMineRead")(function* (
				auth: ReporterAuth,
				reportId: string,
			) {
				const row = yield* mine(auth, reportId);
				yield* markRead(row.report.id);
			});

			const fromLink = Effect.fn("Conversations.fromLink")(function* (
				token: string,
			) {
				const link = readThreadLink(token);
				if (link === null) return yield* notFound();
				if (link === "expired") return "expired" as const;
				return yield* findReport(sql`true`, link.reportId);
			});

			const openLink = Effect.fn("Conversations.openLink")(function* (
				token: string,
			) {
				const row = yield* fromLink(token);
				if (row === "expired") return { expired: true as const };
				const [p] = yield* database.query((db) =>
					db
						.select({ name: project.name })
						.from(project)
						.where(eq(project.id, row.report.projectId)),
				);
				return {
					expired: false as const,
					project: p?.name ?? "",
					thread: yield* threadOf(row),
				};
			});

			const postFromLink = Effect.fn("Conversations.postFromLink")(function* (
				token: string,
				body: string,
			) {
				const row = yield* fromLink(token);
				if (row === "expired")
					return yield* new InvalidInput({ message: "This link has expired" });
				return yield* postAsReporter(row, body);
			});

			const markLinkRead = Effect.fn("Conversations.markLinkRead")(function* (
				token: string,
			) {
				const row = yield* fromLink(token);
				if (row !== "expired") yield* markRead(row.report.id);
			});

			// Plain, like the shipped notice: the reply, what they had written,
			// and a link to answer without an account.
			const emailReporter = Effect.fn("Conversations.emailReporter")(
				function* (
					row: Effect.Success<ReturnType<typeof findReport>>,
					body: string,
					actor: Actor,
				) {
					const to = row.report.reporter?.email;
					// "Stop emails about this report": the widget still shows replies.
					if (!to || row.report.emailsStoppedAt || !mailEnabled()) return;
					const [p] = yield* database.query((db) =>
						db
							.select({ name: project.name })
							.from(project)
							.where(eq(project.id, row.report.projectId)),
					);
					const name = row.report.reporter?.name;
					const title = titleFromMessage(row.report.message);
					yield* Effect.tryPromise(() =>
						sendMail({
							to,
							subject: `Re: ${title}`,
							text: `Hi${name ? ` ${name}` : ""},\n\n${actor.name} from ${p?.name ?? "the team"} replied to your report:\n\n${body}\n\nYou wrote: “${title}”`,
							action: {
								label: "Read and reply",
								url: threadLinkUrl(signThreadLink(row.report.id)),
							},
							...reporterUnsubscribe(row.report.id),
						}),
					);
				},
				Effect.catch((error) =>
					Effect.logError("Reply email to the reporter failed", error),
				),
			);

			const reply = Effect.fn("Conversations.reply")(function* (
				projectId: string,
				reportId: string,
				body: string,
				actor: Actor,
			) {
				if (actor.type === "system")
					return yield* new InvalidInput({
						message: "Only people and agents can reply",
					});
				const text = yield* cleanBody(body);
				const row = yield* findReport(
					eq(report.projectId, projectId),
					reportId,
				);
				const created = yield* insertMessage(row, {
					authorType: actor.type,
					authorId: actor.id,
					authorName: actor.name,
					body: text,
				});
				yield* inBackground(
					"Reply email to the reporter",
					emailReporter(row, text, actor),
				);
				return messageDto(created);
			});

			return Conversations.of({
				listMine,
				getMine,
				postMine,
				markMineRead,
				openLink,
				postFromLink,
				markLinkRead,
				reply,
			});
		}),
	);
}
