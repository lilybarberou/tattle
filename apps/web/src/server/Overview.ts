import { and, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { activity, issue, report } from "#/db/schema";
import { ISSUE_STATUSES, type IssueStatus } from "#/shared/issues";
import { Access, type Principal } from "./Access";
import { Database } from "./Database";
import type { DbError, NotFound } from "./errors";

/** Statuses that still need someone: the triage inbox and accepted work. */
export const OPEN_STATUSES = [
	"triage",
	"backlog",
	"todo",
	"in_progress",
	"in_review",
] as const satisfies ReadonlyArray<IssueStatus>;

/** Days in the reports chart, today included. */
export const OVERVIEW_DAYS = 30;

const DAY = 86_400_000;

export type OverviewIssue = {
	number: number;
	title: string;
	type: "bug" | "feature";
	status: IssueStatus;
	reportCount: number;
	voteCount: number;
};

export type ProjectOverview = {
	/** One entry per UTC day, oldest first, today last. */
	days: Array<{ date: string; bugs: number; features: number }>;
	reports: { last30: number; previous30: number };
	statuses: Record<IssueStatus, number>;
	/** When the oldest issue still in Triage arrived. */
	oldestTriageAt: string | null;
	topReported: OverviewIssue[];
	topVoted: OverviewIssue[];
	resolution: {
		/** Median time from creation to Done, in seconds; null when nothing was resolved. */
		median30: number | null;
		median90: number | null;
		resolved30: number;
		resolved90: number;
	};
};

const utcDay = (date: Date) => date.toISOString().slice(0, 10);

// Timestamps are stored without a time zone, in UTC. A bare Date parameter
// would be sent in the server's local time, so cutoffs go as ISO strings.
const at = (date: Date) => sql`${date.toISOString()}::timestamp`;

export class Overview extends Context.Service<
	Overview,
	{
		/** How a project is doing: aggregates only, for the Overview page. */
		readonly get: (
			principal: Principal,
			projectId: string,
			now?: Date,
		) => Effect.Effect<ProjectOverview, NotFound | DbError>;
	}
>()("tattle/server/Overview") {
	static readonly layer = Layer.effect(
		Overview,
		Effect.gen(function* () {
			const database = yield* Database;
			const access = yield* Access;

			const get = Effect.fn("Overview.get")(function* (
				principal: Principal,
				projectId: string,
				now: Date = new Date(),
			) {
				yield* access.requireProject(principal, projectId);

				const today = new Date(`${utcDay(now)}T00:00:00.000Z`);
				const chartStart = new Date(
					today.getTime() - (OVERVIEW_DAYS - 1) * DAY,
				);
				const previousStart = new Date(
					chartStart.getTime() - OVERVIEW_DAYS * DAY,
				);
				const since30 = new Date(now.getTime() - 30 * DAY);
				const since90 = new Date(now.getTime() - 90 * DAY);

				// Each query reads one index: report (project_id, created_at),
				// issue (project_id, status), activity (issue_id, created_at).
				const [perDay, statusRows, topReported, topVoted, [resolution]] =
					yield* Effect.all(
						[
							database.query((db) =>
								db
									.select({
										day: sql<string>`to_char(date_trunc('day', ${report.createdAt}), 'YYYY-MM-DD')`,
										type: report.type,
										count: sql<number>`count(*)::int`,
									})
									.from(report)
									.where(
										and(
											eq(report.projectId, projectId),
											gte(report.createdAt, previousStart),
										),
									)
									.groupBy(sql`1`, report.type),
							),
							database.query((db) =>
								db
									.select({
										status: issue.status,
										count: sql<number>`count(*)::int`,
										oldest: sql`min(${issue.createdAt})`.mapWith(
											issue.createdAt,
										),
									})
									.from(issue)
									.where(eq(issue.projectId, projectId))
									.groupBy(issue.status),
							),
							database.query((db) =>
								db
									.select({
										number: issue.number,
										title: issue.title,
										type: issue.type,
										status: issue.status,
										reportCount: issue.reportCount,
										voteCount: issue.voteCount,
									})
									.from(issue)
									.where(
										and(
											eq(issue.projectId, projectId),
											inArray(issue.status, [...OPEN_STATUSES]),
											gt(issue.reportCount, 0),
										),
									)
									.orderBy(desc(issue.reportCount), desc(issue.updatedAt))
									.limit(5),
							),
							database.query((db) =>
								db
									.select({
										number: issue.number,
										title: issue.title,
										type: issue.type,
										status: issue.status,
										reportCount: issue.reportCount,
										voteCount: issue.voteCount,
									})
									.from(issue)
									.where(
										and(
											eq(issue.projectId, projectId),
											eq(issue.type, "feature"),
											inArray(issue.status, [...OPEN_STATUSES]),
											gt(issue.voteCount, 0),
										),
									)
									.orderBy(desc(issue.voteCount), desc(issue.updatedAt))
									.limit(5),
							),
							// An issue is resolved when it last moved to Done (the activity
							// log); issues created as Done have no such move and don't count.
							// updated_at is at least the time of that move, so it prunes old
							// issues before the per-issue activity lookup.
							database.query(async (db) => {
								const duration = sql`extract(epoch from (done.at - ${issue.createdAt}))::float8`;
								const result = await db.execute<{
									resolved30: number;
									resolved90: number;
									median30: number | null;
									median90: number | null;
								}>(sql`
									select
										(count(*) filter (where done.at >= ${at(since30)}))::int as resolved30,
										count(*)::int as resolved90,
										(percentile_cont(0.5) within group (order by ${duration})
											filter (where done.at >= ${at(since30)}))::float8 as median30,
										(percentile_cont(0.5) within group (order by ${duration}))::float8 as median90
									from ${issue}
									cross join lateral (
										select max(${activity.createdAt}) as at
										from ${activity}
										where ${activity.issueId} = ${issue.id}
											and ${activity.action} = 'updated'
											and ${activity.data} -> 'changes' -> 'status' ->> 'to' = 'done'
									) as done
									where ${issue.projectId} = ${projectId}
										and ${issue.status} = 'done'
										and ${issue.updatedAt} >= ${at(since90)} - interval '1 day'
										and done.at >= ${at(since90)}
								`);
								return result.rows;
							}),
						],
						{ concurrency: "unbounded" },
					);

				const chartFrom = utcDay(chartStart);
				const byDay = new Map<string, { bugs: number; features: number }>();
				let last30 = 0;
				let previous30 = 0;
				for (const row of perDay) {
					if (row.day < chartFrom) {
						previous30 += row.count;
						continue;
					}
					last30 += row.count;
					const entry = byDay.get(row.day) ?? { bugs: 0, features: 0 };
					if (row.type === "bug") entry.bugs += row.count;
					else entry.features += row.count;
					byDay.set(row.day, entry);
				}
				const days = Array.from({ length: OVERVIEW_DAYS }, (_, i) => {
					const date = utcDay(new Date(chartStart.getTime() + i * DAY));
					return { date, ...(byDay.get(date) ?? { bugs: 0, features: 0 }) };
				});

				const statuses = Object.fromEntries(
					ISSUE_STATUSES.map((s) => [s, 0]),
				) as Record<IssueStatus, number>;
				let oldestTriageAt: string | null = null;
				for (const row of statusRows) {
					statuses[row.status] = row.count;
					if (row.status === "triage" && row.oldest)
						oldestTriageAt = new Date(row.oldest).toISOString();
				}

				return {
					days,
					reports: { last30, previous30 },
					statuses,
					oldestTriageAt,
					topReported,
					topVoted,
					resolution: {
						median30: resolution?.median30 ?? null,
						median90: resolution?.median90 ?? null,
						resolved30: resolution?.resolved30 ?? 0,
						resolved90: resolution?.resolved90 ?? 0,
					},
				} satisfies ProjectOverview;
			});

			return Overview.of({ get });
		}),
	);
}
