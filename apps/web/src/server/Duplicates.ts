import {
	and,
	asc,
	desc,
	eq,
	isNotNull,
	isNull,
	ne,
	notInArray,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Context, Effect, Layer } from "effect";
import {
	activity,
	duplicateSuggestion,
	issue,
	issueSearchDocument,
	project,
	report,
} from "#/db/schema";
import type { DuplicateSuggestionView } from "#/shared/ai";
import type { Actor } from "./Access";
import { AiSettings } from "./AiSettings";
import {
	anyWordQuery,
	buildJudgePrompt,
	complete,
	parseJudgement,
	searchWords,
	TEXT_SUGGESTION_MIN_SHARED,
	TEXT_SUGGESTION_THRESHOLD,
	wordSimilarity,
} from "./ai";
import { Database } from "./Database";
import { type DbError, NotFound } from "./errors";

/** How many similar issues are kept, and shown to the AI. */
export const MAX_CANDIDATES = 8;

export type DuplicateCandidate = {
	id: string;
	number: number;
	type: "bug" | "feature";
	status: string;
	title: string;
	description: string;
	/** Postgres full-text rank: orders the candidates. */
	rank: number;
	/** Share of words in common with the issue, from 0 to 1. */
	score: number;
	sharedWords: string[];
};

const suggested = alias(issue, "suggested");

/**
 * The open suggestion of an issue, if any: not dismissed, and pointing at an
 * issue that was not merged elsewhere since.
 */
export const openSuggestion = (
	database: typeof Database.Service,
	issueId: string,
) =>
	database
		.query((db) =>
			db
				.select({
					id: duplicateSuggestion.id,
					source: duplicateSuggestion.source,
					reason: duplicateSuggestion.reason,
					score: duplicateSuggestion.score,
					createdAt: duplicateSuggestion.createdAt,
					number: suggested.number,
					title: suggested.title,
					status: suggested.status,
					type: suggested.type,
				})
				.from(duplicateSuggestion)
				.innerJoin(
					suggested,
					eq(suggested.id, duplicateSuggestion.suggestedIssueId),
				)
				.innerJoin(issue, eq(issue.id, duplicateSuggestion.issueId))
				.where(
					and(
						eq(duplicateSuggestion.issueId, issueId),
						isNull(duplicateSuggestion.dismissedAt),
						ne(suggested.status, "duplicate"),
						ne(issue.status, "duplicate"),
					),
				)
				.orderBy(desc(duplicateSuggestion.createdAt))
				.limit(1),
		)
		.pipe(
			Effect.map(([row]): DuplicateSuggestionView | null =>
				row
					? {
							id: row.id,
							source: row.source,
							reason: row.reason,
							score: row.score,
							issue: {
								number: row.number,
								title: row.title,
								status: row.status,
								type: row.type,
							},
							createdAt: row.createdAt.toISOString(),
						}
					: null,
			),
		);

const textReason = (candidate: DuplicateCandidate) =>
	`Most of its words match: ${candidate.sharedWords
		.slice(0, 5)
		.map((w) => `“${w}”`)
		.join(", ")}.`;

export class Duplicates extends Context.Service<
	Duplicates,
	{
		/** The issues most similar to this one, best first, by full-text search. */
		readonly candidates: (
			issueId: string,
		) => Effect.Effect<DuplicateCandidate[], NotFound | DbError>;
		/**
		 * Looks for a duplicate and stores the suggestion, replacing the open one.
		 * The AI judges when the workspace turned it on; otherwise, or when the
		 * AI fails, only a near-identical wording is suggested.
		 */
		readonly suggest: (
			issueId: string,
		) => Effect.Effect<DuplicateSuggestionView | null, NotFound | DbError>;
		/** `suggest` by issue number, for the "Find duplicates" button. */
		readonly find: (
			projectId: string,
			number: number,
		) => Effect.Effect<DuplicateSuggestionView | null, NotFound | DbError>;
		/** `suggest` without waiting: for ingest, which must stay fast and never fail. */
		readonly suggestInBackground: (issueId: string) => Effect.Effect<void>;
		/** "Not a duplicate": the pair is never suggested again. */
		readonly dismiss: (
			projectId: string,
			number: number,
			actor: Actor,
		) => Effect.Effect<void, NotFound | DbError>;
	}
>()("tattle/server/Duplicates") {
	static readonly layer = Layer.effect(
		Duplicates,
		Effect.gen(function* () {
			const database = yield* Database;
			const ai = yield* AiSettings;

			const loadIssue = Effect.fn("Duplicates.loadIssue")(function* (
				issueId: string,
			) {
				const [row] = yield* database.query((db) =>
					db
						.select({
							id: issue.id,
							projectId: issue.projectId,
							number: issue.number,
							type: issue.type,
							status: issue.status,
							title: issue.title,
							description: issue.description,
							organizationId: project.organizationId,
						})
						.from(issue)
						.innerJoin(project, eq(project.id, issue.projectId))
						.where(eq(issue.id, issueId)),
				);
				if (!row) return yield* new NotFound({ message: "Issue not found" });
				const [first] = yield* database.query((db) =>
					db
						.select({
							message: report.message,
							pageUrl: report.pageUrl,
							console: report.console,
						})
						.from(report)
						.where(eq(report.issueId, issueId))
						.orderBy(asc(report.createdAt))
						.limit(1),
				);
				return { ...row, firstReport: first ?? null };
			});

			const findCandidates = Effect.fn("Duplicates.findCandidates")(function* (
				target: Effect.Success<ReturnType<typeof loadIssue>>,
			) {
				const words = searchWords(
					[
						target.title,
						target.description,
						target.firstReport?.message ?? "",
					].join(" "),
				);
				if (words.length === 0) return [];
				const dismissed = yield* database.query((db) =>
					db
						.select({ id: duplicateSuggestion.suggestedIssueId })
						.from(duplicateSuggestion)
						.where(
							and(
								eq(duplicateSuggestion.issueId, target.id),
								isNotNull(duplicateSuggestion.dismissedAt),
							),
						),
				);
				const query = sql`to_tsquery('simple', ${anyWordQuery(words)})`;
				const rank = sql<number>`(ts_rank(${issueSearchDocument(issue)}, ${query}) + ts_rank(to_tsvector('simple', ${issue.title}), ${query}))::float8`;
				const rows = yield* database.query((db) =>
					db
						.select({
							id: issue.id,
							number: issue.number,
							type: issue.type,
							status: issue.status,
							title: issue.title,
							description: issue.description,
							rank,
						})
						.from(issue)
						.where(
							and(
								eq(issue.projectId, target.projectId),
								ne(issue.id, target.id),
								// Done issues stay: a report about them is a regression.
								notInArray(issue.status, ["duplicate", "canceled"]),
								dismissed.length > 0
									? notInArray(
											issue.id,
											dismissed.map((d) => d.id),
										)
									: undefined,
								sql`${issueSearchDocument(issue)} @@ ${query}`,
							),
						)
						.orderBy(desc(rank), desc(issue.updatedAt))
						.limit(MAX_CANDIDATES),
				);
				return rows.map((row): DuplicateCandidate => {
					const similarity = wordSimilarity(
						words,
						searchWords(`${row.title} ${row.description}`),
					);
					return {
						...row,
						rank: Number(row.rank),
						score: Math.round(similarity.score * 1000) / 1000,
						sharedWords: similarity.shared,
					};
				});
			});

			const candidates = (issueId: string) =>
				loadIssue(issueId).pipe(Effect.flatMap(findCandidates));

			const store = Effect.fn("Duplicates.store")(function* (
				issueId: string,
				suggestion: {
					candidate: DuplicateCandidate;
					source: "ai" | "text";
					reason: string;
				} | null,
			) {
				yield* database.transaction(async (tx) => {
					await tx
						.delete(duplicateSuggestion)
						.where(
							and(
								eq(duplicateSuggestion.issueId, issueId),
								isNull(duplicateSuggestion.dismissedAt),
							),
						);
					if (suggestion)
						await tx
							.insert(duplicateSuggestion)
							.values({
								issueId,
								suggestedIssueId: suggestion.candidate.id,
								source: suggestion.source,
								reason: suggestion.reason,
								score: suggestion.candidate.score,
							})
							.onConflictDoNothing();
				});
				return yield* openSuggestion(database, issueId);
			});

			const suggest = Effect.fn("Duplicates.suggest")(function* (
				issueId: string,
			) {
				const target = yield* loadIssue(issueId);
				if (target.status === "duplicate") return null;
				const found = yield* findCandidates(target);
				if (found.length === 0) return yield* store(issueId, null);

				const config = yield* ai.configFor(target.organizationId);
				if (config) {
					const prompt = buildJudgePrompt(
						{
							type: target.type,
							message: target.firstReport?.message ?? target.description,
							pageUrl: target.firstReport?.pageUrl ?? "",
							consoleErrors: (target.firstReport?.console ?? [])
								.filter((entry) => entry.level === "error")
								.map((entry) => entry.message),
						},
						found,
					);
					const answer = yield* complete(config, {
						...prompt,
						maxTokens: 2048,
						json: true,
					}).pipe(Effect.result);
					// Only the status and our own wording are logged: never the key,
					// the report or what the provider said about them.
					if (answer._tag === "Failure") {
						yield* Effect.logWarning(
							`AI duplicate check of issue ${issueId} failed${answer.failure.status ? ` (HTTP ${answer.failure.status})` : ""}; using word matching`,
						);
					} else {
						const verdict = parseJudgement(
							answer.success,
							found.map((c) => c.number),
						);
						if (!verdict) {
							yield* Effect.logWarning(
								`AI duplicate check of issue ${issueId} gave an unusable answer; using word matching`,
							);
						} else {
							const match = found.find((c) => c.number === verdict.duplicateOf);
							return yield* store(
								issueId,
								match
									? {
											candidate: match,
											source: "ai",
											reason:
												verdict.reason ||
												`Same problem as #${match.number}, according to the AI.`,
										}
									: null,
							);
						}
					}
				}

				const best = [...found].sort((a, b) => b.score - a.score)[0];
				if (
					best &&
					best.score >= TEXT_SUGGESTION_THRESHOLD &&
					best.sharedWords.length >= TEXT_SUGGESTION_MIN_SHARED
				)
					return yield* store(issueId, {
						candidate: best,
						source: "text",
						reason: textReason(best),
					});
				// The AI failed this time: keep what an earlier check found.
				if (config) return yield* openSuggestion(database, issueId);
				return yield* store(issueId, null);
			});

			const suggestInBackground = (issueId: string) =>
				suggest(issueId).pipe(
					Effect.catchCause((cause) =>
						// The cause may hold SQL parameters (report text): log its kind only.
						Effect.logWarning(
							`Duplicate check of issue ${issueId} failed: ${
								cause.reasons
									.map((reason) =>
										reason._tag === "Fail"
											? (reason.error as { _tag?: string })._tag
											: reason._tag,
									)
									.join(", ") || "unknown"
							}`,
						),
					),
					Effect.forkDetach,
					Effect.asVoid,
				);

			const findIssueId = Effect.fn("Duplicates.findIssueId")(function* (
				projectId: string,
				number: number,
			) {
				const [row] = yield* database.query((db) =>
					db
						.select({ id: issue.id })
						.from(issue)
						.where(
							and(eq(issue.projectId, projectId), eq(issue.number, number)),
						),
				);
				if (!row)
					return yield* new NotFound({ message: `Issue #${number} not found` });
				return row;
			});

			const find = (projectId: string, number: number) =>
				findIssueId(projectId, number).pipe(
					Effect.flatMap((row) => suggest(row.id)),
				);

			const dismiss = Effect.fn("Duplicates.dismiss")(function* (
				projectId: string,
				number: number,
				actor: Actor,
			) {
				const row = yield* findIssueId(projectId, number);
				const open = yield* openSuggestion(database, row.id);
				if (!open) return;
				yield* database.query((db) =>
					db
						.update(duplicateSuggestion)
						.set({ dismissedAt: new Date() })
						.where(eq(duplicateSuggestion.id, open.id)),
				);
				yield* database.query((db) =>
					db.insert(activity).values({
						issueId: row.id,
						actorType: actor.type,
						actorId: actor.id,
						actorName: actor.name,
						action: "dismissed_duplicate",
						data: { suggested: open.issue.number, source: open.source },
					}),
				);
			});

			return Duplicates.of({
				candidates,
				suggest,
				find,
				suggestInBackground,
				dismiss,
			});
		}),
	);
}
