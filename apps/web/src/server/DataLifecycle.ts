import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { Context, Effect, Layer, Schedule } from "effect";
import { activity, issue, issueVote, project, report } from "#/db/schema";
import type { Actor } from "./Access";
import { Database } from "./Database";
import { type DbError, NotFound, type StorageError } from "./errors";
import { Storage } from "./Storage";

export type ReporterMatch = {
	reports: number;
	votes: number;
	projects: string[];
};

/**
 * Deleting things and the personal data in them: projects, reports, issues,
 * everything about one end user (GDPR access and erasure), and the automatic
 * purge of old screenshots, logs and steps (REPORT_RETENTION_DAYS).
 */
export class DataLifecycle extends Context.Service<
	DataLifecycle,
	{
		readonly deleteProject: (
			projectId: string,
		) => Effect.Effect<void, DbError | StorageError>;
		readonly deleteReport: (
			projectId: string,
			reportId: string,
			actor: Actor,
		) => Effect.Effect<void, NotFound | DbError | StorageError>;
		readonly deleteIssue: (
			projectId: string,
			number: number,
		) => Effect.Effect<void, NotFound | DbError | StorageError>;
		readonly findReporter: (
			organizationId: string,
			query: string,
		) => Effect.Effect<ReporterMatch, DbError>;
		readonly exportReporter: (
			organizationId: string,
			query: string,
		) => Effect.Effect<unknown, DbError>;
		readonly eraseReporter: (
			organizationId: string,
			query: string,
		) => Effect.Effect<
			{ reports: number; issues: number; votes: number },
			DbError | StorageError
		>;
		readonly purgeExpired: (
			days: number,
		) => Effect.Effect<number, DbError | StorageError>;
	}
>()("tattle/server/DataLifecycle") {
	static readonly layer = Layer.effect(
		DataLifecycle,
		Effect.gen(function* () {
			const database = yield* Database;
			const storage = yield* Storage;

			const recount = (issueIds: string[]) =>
				issueIds.length === 0
					? Effect.void
					: database.query((db) =>
							db
								.update(issue)
								.set({
									reportCount: sql`(select count(*) from ${report} where ${report.issueId} = ${issue.id})::int`,
									voteCount: sql`(select count(*) from ${issueVote} where ${issueVote.issueId} = ${issue.id})::int`,
								})
								.where(inArray(issue.id, issueIds)),
						);

			const deleteProject = Effect.fn("DataLifecycle.deleteProject")(function* (
				projectId: string,
			) {
				// Files first: if the bucket fails, the project is still there to retry.
				yield* storage.removePrefix(`${projectId}/`);
				yield* database.query((db) =>
					db.delete(project).where(eq(project.id, projectId)),
				);
			});

			const deleteReport = Effect.fn("DataLifecycle.deleteReport")(function* (
				projectId: string,
				reportId: string,
				actor: Actor,
			) {
				const [row] = yield* database.query((db) =>
					db
						.select()
						.from(report)
						.where(
							and(eq(report.projectId, projectId), eq(report.id, reportId)),
						),
				);
				if (!row) return yield* new NotFound({ message: "Report not found" });
				if (row.screenshotKey) yield* storage.remove([row.screenshotKey]);
				yield* database.query((db) =>
					db.delete(report).where(eq(report.id, reportId)),
				);
				if (row.issueId) {
					yield* recount([row.issueId]);
					yield* database.query((db) =>
						db.insert(activity).values({
							issueId: row.issueId as string,
							actorType: actor.type,
							actorId: actor.id,
							actorName: actor.name,
							action: "report_deleted",
						}),
					);
				}
			});

			const deleteIssue = Effect.fn("DataLifecycle.deleteIssue")(function* (
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
				const reports = yield* database.query((db) =>
					db
						.select({ id: report.id, key: report.screenshotKey })
						.from(report)
						.where(eq(report.issueId, row.id)),
				);
				yield* storage.remove(reports.flatMap((r) => (r.key ? [r.key] : [])));
				yield* database.query((db) =>
					db.transaction(async (tx) => {
						await tx.delete(report).where(eq(report.issueId, row.id));
						// Issues merged into this one stay as duplicates pointing nowhere.
						await tx
							.update(issue)
							.set({ duplicateOfId: null })
							.where(eq(issue.duplicateOfId, row.id));
						await tx.delete(issue).where(eq(issue.id, row.id));
					}),
				);
			});

			// A person is matched by the email or the user id the app gave the widget.
			const reporterCondition = (query: string) => {
				const value = query.trim();
				return or(
					sql`lower(${report.reporter}->>'email') = lower(${value})`,
					sql`${report.reporter}->>'id' = ${value}`,
				);
			};
			const orgProjects = (organizationId: string) =>
				database.query((db) =>
					db
						.select({ id: project.id, name: project.name })
						.from(project)
						.where(eq(project.organizationId, organizationId)),
				);

			const findReporter = Effect.fn("DataLifecycle.findReporter")(function* (
				organizationId: string,
				query: string,
			) {
				const projects = yield* orgProjects(organizationId);
				if (projects.length === 0 || !query.trim())
					return { reports: 0, votes: 0, projects: [] };
				const ids = projects.map((p) => p.id);
				const rows = yield* database.query((db) =>
					db
						.select({ projectId: report.projectId })
						.from(report)
						.where(
							and(inArray(report.projectId, ids), reporterCondition(query)),
						),
				);
				const [votes] = yield* database.query((db) =>
					db
						.select({ value: sql<number>`count(*)::int` })
						.from(issueVote)
						.innerJoin(issue, eq(issue.id, issueVote.issueId))
						.where(
							and(
								inArray(issue.projectId, ids),
								sql`lower(${issueVote.email}) = lower(${query.trim()})`,
							),
						),
				);
				const names = new Set(
					rows.map(
						(r) => projects.find((p) => p.id === r.projectId)?.name ?? "",
					),
				);
				return {
					reports: rows.length,
					votes: votes?.value ?? 0,
					projects: [...names],
				};
			});

			const exportReporter = Effect.fn("DataLifecycle.exportReporter")(
				function* (organizationId: string, query: string) {
					const projects = yield* orgProjects(organizationId);
					const ids = projects.map((p) => p.id);
					if (ids.length === 0) return { reports: [], votes: [] };
					const rows = yield* database.query((db) =>
						db
							.select()
							.from(report)
							.where(
								and(inArray(report.projectId, ids), reporterCondition(query)),
							),
					);
					const votes = yield* database.query((db) =>
						db
							.select({ issue: issue.title, votedAt: issueVote.createdAt })
							.from(issueVote)
							.innerJoin(issue, eq(issue.id, issueVote.issueId))
							.where(
								and(
									inArray(issue.projectId, ids),
									sql`lower(${issueVote.email}) = lower(${query.trim()})`,
								),
							),
					);
					return {
						exportedAt: new Date().toISOString(),
						subject: query.trim(),
						reports: rows.map((r) => ({
							project: projects.find((p) => p.id === r.projectId)?.name,
							type: r.type,
							message: r.message,
							page: r.pageUrl,
							reporter: r.reporter,
							context: r.context,
							device: r.device,
							console: r.console,
							network: r.network,
							breadcrumbs: r.breadcrumbs,
							screenshot: r.screenshotKey
								? storage.signedUrl(r.screenshotKey, 7 * 24 * 3600)
								: null,
							sentAt: r.createdAt.toISOString(),
						})),
						votes: votes.map((v) => ({
							issue: v.issue,
							votedAt: v.votedAt.toISOString(),
						})),
					};
				},
			);

			const eraseReporter = Effect.fn("DataLifecycle.eraseReporter")(function* (
				organizationId: string,
				query: string,
			) {
				const projects = yield* orgProjects(organizationId);
				const ids = projects.map((p) => p.id);
				if (ids.length === 0 || !query.trim())
					return { reports: 0, issues: 0, votes: 0 };
				const rows = yield* database.query((db) =>
					db
						.select({
							id: report.id,
							issueId: report.issueId,
							key: report.screenshotKey,
						})
						.from(report)
						.where(
							and(inArray(report.projectId, ids), reporterCondition(query)),
						),
				);
				yield* storage.remove(rows.flatMap((r) => (r.key ? [r.key] : [])));
				const touched = [
					...new Set(rows.flatMap((r) => (r.issueId ? [r.issueId] : []))),
				];
				if (rows.length > 0) {
					yield* database.query((db) =>
						db.delete(report).where(
							inArray(
								report.id,
								rows.map((r) => r.id),
							),
						),
					);
				}
				const deletedVotes = yield* database.query((db) =>
					db
						.delete(issueVote)
						.where(
							and(
								sql`${issueVote.issueId} in (select ${issue.id} from ${issue} where ${issue.projectId} in ${ids})`,
								sql`lower(${issueVote.email}) = lower(${query.trim()})`,
							),
						)
						.returning({ issueId: issueVote.issueId }),
				);
				// An issue opened from this person's report, with no report left, still
				// carries their words in its title and description: delete it too.
				const orphaned =
					touched.length === 0
						? []
						: yield* database.query((db) =>
								db
									.select({ id: issue.id })
									.from(issue)
									.where(
										and(
											inArray(issue.id, touched),
											sql`not exists (select 1 from ${report} where ${report.issueId} = ${issue.id})`,
											sql`exists (select 1 from ${activity} where ${activity.issueId} = ${issue.id} and ${activity.action} = 'created_from_report')`,
										),
									),
							);
				if (orphaned.length > 0) {
					yield* database.query((db) =>
						db.delete(issue).where(
							inArray(
								issue.id,
								orphaned.map((o) => o.id),
							),
						),
					);
				}
				const gone = new Set(orphaned.map((o) => o.id));
				yield* recount(
					[
						...new Set([...touched, ...deletedVotes.map((v) => v.issueId)]),
					].filter((id) => !gone.has(id)),
				);
				return {
					reports: rows.length,
					issues: orphaned.length,
					votes: deletedVotes.length,
				};
			});

			// Keeps the message and who sent it, drops what is heavy and sensitive:
			// the screenshot, the logs and the steps before the report.
			const purgeExpired = Effect.fn("DataLifecycle.purgeExpired")(function* (
				days: number,
			) {
				const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
				const rows = yield* database.query((db) =>
					db
						.select({ id: report.id, key: report.screenshotKey })
						.from(report)
						.where(
							and(
								lt(report.createdAt, cutoff),
								or(
									isNotNull(report.screenshotKey),
									sql`jsonb_array_length(${report.console}) > 0`,
									sql`jsonb_array_length(${report.network}) > 0`,
									sql`jsonb_array_length(${report.breadcrumbs}) > 0`,
								),
							),
						)
						.limit(500),
				);
				if (rows.length === 0) return 0;
				yield* storage.remove(rows.flatMap((r) => (r.key ? [r.key] : [])));
				yield* database.query((db) =>
					db
						.update(report)
						.set({
							screenshotKey: null,
							console: [],
							network: [],
							breadcrumbs: [],
						})
						.where(
							inArray(
								report.id,
								rows.map((r) => r.id),
							),
						),
				);
				return rows.length;
			});

			const retentionDays = Number(process.env.REPORT_RETENTION_DAYS);
			if (Number.isInteger(retentionDays) && retentionDays > 0) {
				yield* purgeExpired(retentionDays).pipe(
					Effect.tap((count) =>
						count > 0
							? Effect.logInfo(
									`Purged screenshots and logs of ${count} reports older than ${retentionDays} days`,
								)
							: Effect.void,
					),
					Effect.catch((error) =>
						Effect.logError("Retention purge failed", error),
					),
					Effect.delay("30 seconds"),
					Effect.repeat(Schedule.spaced("6 hours")),
					Effect.forkScoped,
				);
			}

			return DataLifecycle.of({
				deleteProject,
				deleteReport,
				deleteIssue,
				findReporter,
				exportReporter,
				eraseReporter,
				purgeExpired,
			});
		}),
	);
}
