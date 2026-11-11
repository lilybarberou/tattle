import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { issue, issueVote, project } from "#/db/schema";
import { Database } from "./Database";
import { type DbError, InvalidInput, NotFound } from "./errors";
import { Issues } from "./Issues";

/** What the public sees: accepted feature requests, never Triage or declined ones. */
const PUBLIC_STATUSES = [
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"done",
] as const;

export type PortalRequest = {
	number: number;
	title: string;
	status: (typeof PUBLIC_STATUSES)[number];
	demand: number;
	voted: boolean;
};

export class Portal extends Context.Service<
	Portal,
	{
		readonly get: (
			slug: string,
			voterKey: string | null,
		) => Effect.Effect<
			{ project: { name: string; slug: string }; requests: PortalRequest[] },
			NotFound | DbError
		>;
		/** Adds or removes the visitor's vote; returns the new state. */
		readonly toggleVote: (
			slug: string,
			number: number,
			voterKey: string,
		) => Effect.Effect<
			{ voted: boolean; demand: number },
			NotFound | InvalidInput | DbError
		>;
		/** Remembers an email on the visitor's vote, to tell them when it ships. */
		readonly setVoteEmail: (
			slug: string,
			number: number,
			voterKey: string,
			email: string,
		) => Effect.Effect<void, NotFound | DbError>;
		/** A new idea goes to Triage; the author's vote is counted right away. */
		readonly suggest: (
			slug: string,
			input: { title: string; description?: string; email?: string },
			voterKey: string,
		) => Effect.Effect<{ number: number }, NotFound | InvalidInput | DbError>;
	}
>()("tattle/server/Portal") {
	static readonly layer = Layer.effect(
		Portal,
		Effect.gen(function* () {
			const database = yield* Database;
			const issues = yield* Issues;

			const findProject = Effect.fn("Portal.findProject")(function* (
				slug: string,
			) {
				const [row] = yield* database.query((db) =>
					db
						.select()
						.from(project)
						.where(
							and(
								eq(project.portalSlug, slug),
								eq(project.portalEnabled, true),
							),
						),
				);
				if (!row)
					return yield* new NotFound({ message: "This page does not exist" });
				return row;
			});

			const findRequest = Effect.fn("Portal.findRequest")(function* (
				projectId: string,
				number: number,
			) {
				const [row] = yield* database.query((db) =>
					db
						.select()
						.from(issue)
						.where(
							and(
								eq(issue.projectId, projectId),
								eq(issue.number, number),
								eq(issue.type, "feature"),
								inArray(issue.status, [...PUBLIC_STATUSES]),
							),
						),
				);
				if (!row)
					return yield* new NotFound({ message: "This request is not public" });
				return row;
			});

			const recount = (issueId: string) =>
				database
					.query((db) =>
						db
							.update(issue)
							.set({
								voteCount: sql`(select count(*) from ${issueVote} where ${issueVote.issueId} = ${issue.id})::int`,
							})
							.where(eq(issue.id, issueId))
							.returning({
								reportCount: issue.reportCount,
								voteCount: issue.voteCount,
							}),
					)
					.pipe(
						Effect.map(([row]) => (row ? row.reportCount + row.voteCount : 0)),
					);

			const get = Effect.fn("Portal.get")(function* (
				slug: string,
				voterKey: string | null,
			) {
				const p = yield* findProject(slug);
				const rows = yield* database.query((db) =>
					db
						.select()
						.from(issue)
						.where(
							and(
								eq(issue.projectId, p.id),
								eq(issue.type, "feature"),
								inArray(issue.status, [...PUBLIC_STATUSES]),
							),
						)
						.orderBy(
							desc(sql`${issue.reportCount} + ${issue.voteCount}`),
							desc(issue.updatedAt),
						)
						.limit(300),
				);
				const mine = voterKey
					? yield* database.query((db) =>
							db
								.select({ issueId: issueVote.issueId })
								.from(issueVote)
								.where(eq(issueVote.voterKey, voterKey)),
						)
					: [];
				const voted = new Set(mine.map((v) => v.issueId));
				return {
					project: { name: p.name, slug: p.portalSlug ?? slug },
					requests: rows.map((r) => ({
						number: r.number,
						title: r.title,
						status: r.status as PortalRequest["status"],
						demand: r.reportCount + r.voteCount,
						voted: voted.has(r.id),
					})),
				};
			});

			const toggleVote = Effect.fn("Portal.toggleVote")(function* (
				slug: string,
				number: number,
				voterKey: string,
			) {
				const p = yield* findProject(slug);
				const request = yield* findRequest(p.id, number);
				if (request.status === "done") {
					return yield* new InvalidInput({
						message: "This one has shipped already",
					});
				}
				const removed = yield* database.query((db) =>
					db
						.delete(issueVote)
						.where(
							and(
								eq(issueVote.issueId, request.id),
								eq(issueVote.voterKey, voterKey),
							),
						)
						.returning({ id: issueVote.id }),
				);
				if (removed.length === 0) {
					yield* database.query((db) =>
						db
							.insert(issueVote)
							.values({ issueId: request.id, voterKey })
							.onConflictDoNothing(),
					);
				}
				const demand = yield* recount(request.id);
				return { voted: removed.length === 0, demand };
			});

			const setVoteEmail = Effect.fn("Portal.setVoteEmail")(function* (
				slug: string,
				number: number,
				voterKey: string,
				email: string,
			) {
				const p = yield* findProject(slug);
				const request = yield* findRequest(p.id, number);
				yield* database.query((db) =>
					db
						.update(issueVote)
						.set({ email: email.trim().toLowerCase() })
						.where(
							and(
								eq(issueVote.issueId, request.id),
								eq(issueVote.voterKey, voterKey),
							),
						),
				);
			});

			const suggest = Effect.fn("Portal.suggest")(function* (
				slug: string,
				input: { title: string; description?: string; email?: string },
				voterKey: string,
			) {
				const p = yield* findProject(slug);
				const created = yield* issues.create(
					p.id,
					{
						type: "feature",
						title: input.title,
						description: input.description ?? "",
						status: "triage",
					},
					{ type: "system", id: null, name: "Public portal" },
				);
				yield* database.query((db) =>
					db.insert(issueVote).values({
						issueId: created.id,
						voterKey,
						email: input.email?.trim().toLowerCase() || null,
					}),
				);
				yield* recount(created.id);
				return { number: created.number };
			});

			return Portal.of({ get, toggleVote, setVoteEmail, suggest });
		}),
	);
}
