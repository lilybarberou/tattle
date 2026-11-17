import { sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import {
	activity,
	duplicateSuggestion,
	issue,
	report,
	reportMessage,
	webhookDelivery,
	webhookEndpoint,
} from "#/db/schema";
import { Access, type Principal } from "./Access";
import { Database } from "./Database";
import type { DbError, NotFound } from "./errors";
import { at, resolutionOf } from "./Overview";

export const STATS_DEFAULT_DAYS = 30;
export const STATS_MAX_DAYS = 365;
/** Most rows in a list of strings an app sent (SDK versions, releases). */
export const STATS_MAX_ROWS = 50;
/** Longest SDK name, version or release returned, in characters. */
export const STATS_MAX_LENGTH = 100;

const DAY = 86_400_000;
const HOUR = 3_600_000;

/**
 * A project's aggregates for agents (the get_stats MCP tool). Counts,
 * durations, versions and booleans only: no name, email, user id, message or
 * page. The field names are a contract (docs/ANALYTICS.md): add, never rename.
 */
export type ProjectStats = {
	period: { from: string; to: string; days: number };
	reports: {
		total: number;
		byType: { bug: number; feature: number };
		/** One entry per UTC day of the period, oldest first. */
		byDay: Array<{ date: string; bug: number; feature: number }>;
	};
	triage: {
		open: number;
		oldestAgeHours: number | null;
		medianTimeToTriageHours: number | null;
	};
	resolution: {
		resolved30Days: number;
		median30Days: number | null;
		median90Days: number | null;
	};
	actors: {
		byAction: Array<{
			action: string;
			user: number;
			agent: number;
			system: number;
		}>;
	};
	duplicates: { suggested: number; merged: number; dismissed: number };
	regressions: {
		count: number;
		byRelease: Array<{ release: string | null; count: number }>;
	};
	sdkVersions: Array<{
		name: string | null;
		version: string | null;
		reports: number;
		lastSeenAt: string;
	}>;
	releases: Array<{
		release: string | null;
		reports: number;
		lastSeenAt: string;
	}>;
	conversations: { waiting: number; medianFirstReplyHours: number | null };
	webhooks: { failed: number };
	github: { lastDeliveryAt: string | null };
};

const utcDay = (date: Date) => date.toISOString().slice(0, 10);
const hours = (ms: number) => Math.round((ms / HOUR) * 100) / 100;
const secondsToHours = (seconds: number | null) =>
	seconds === null ? null : hours(seconds * 1000);
/** A timestamp (stored in UTC, without a time zone) as an ISO string. */
const isoText = (expression: ReturnType<typeof sql>) =>
	sql`to_char(${expression}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
/** A string an app or an end user sent, cut to a bounded length. */
const capped = (expression: ReturnType<typeof sql>) =>
	sql`left(${expression}, ${STATS_MAX_LENGTH})`;

export class Stats extends Context.Service<
	Stats,
	{
		/**
		 * One project's figures over the `days` UTC days ending today (today
		 * included). Resolution keeps its fixed 30- and 90-day windows.
		 */
		readonly get: (
			principal: Principal,
			projectId: string,
			days?: number,
			now?: Date,
		) => Effect.Effect<ProjectStats, NotFound | DbError>;
	}
>()("tattle/server/Stats") {
	static readonly layer = Layer.effect(
		Stats,
		Effect.gen(function* () {
			const database = yield* Database;
			const access = yield* Access;

			const rows = <T extends Record<string, unknown>>(
				query: ReturnType<typeof sql>,
			) => database.query(async (db) => (await db.execute<T>(query)).rows);

			const get = Effect.fn("Stats.get")(function* (
				principal: Principal,
				projectId: string,
				requested: number = STATS_DEFAULT_DAYS,
				now: Date = new Date(),
			) {
				// The MCP tool validates it; other callers get a bounded period too.
				const days = Math.min(
					Math.max(Math.trunc(requested) || STATS_DEFAULT_DAYS, 1),
					STATS_MAX_DAYS,
				);
				const p = yield* access.requireProject(principal, projectId);
				const today = new Date(`${utcDay(now)}T00:00:00.000Z`);
				const from = new Date(today.getTime() - (days - 1) * DAY);
				const since = at(from);

				// Every query is about one project. Reports read the index
				// (project_id, created_at); issues (project_id, status); activity,
				// suggestions and messages are reached through their issue or
				// report, by (issue_id, …) and (report_id, created_at) indexes.
				const [
					perDay,
					[triage],
					[timeToTriage],
					resolution,
					byAction,
					[duplicates],
					regressions,
					sdkVersions,
					releases,
					[waiting],
					[firstReply],
					[webhooks],
				] = yield* Effect.all(
					[
						rows<{ day: string; type: "bug" | "feature"; count: number }>(sql`
							select to_char(date_trunc('day', ${report.createdAt}), 'YYYY-MM-DD') as day,
								${report.type} as type, count(*)::int as count
							from ${report}
							where ${report.projectId} = ${projectId} and ${report.createdAt} >= ${since}
							group by 1, 2
						`),
						rows<{ open: number; oldest: string | null }>(sql`
							select count(*)::int as open, ${isoText(sql`min(${issue.createdAt})`)} as oldest
							from ${issue}
							where ${issue.projectId} = ${projectId} and ${issue.status} = 'triage'
						`),
						// An issue leaves Triage at its first status change from
						// "triage", or when it is merged as a duplicate. A merge logs no
						// "from", so it counts only for issues that arrived in Triage: from
						// a widget report or the public portal. updated_at is at least
						// the time of that move, so it prunes issues before the lookup.
						rows<{ median: number | null }>(sql`
							select (percentile_cont(0.5) within group (
								order by extract(epoch from (exited.at - ${issue.createdAt}))
							))::float8 as median
							from ${issue}
							cross join lateral (
								select min(a.created_at) as at
								from ${activity} as a
								where a.issue_id = ${issue.id}
									and (
										(a.action = 'updated'
											and a.data -> 'changes' -> 'status' ->> 'from' = 'triage')
										or (a.action = 'marked_duplicate' and exists (
											select 1 from ${activity} as arrival
											where arrival.issue_id = ${issue.id}
												and (arrival.action = 'created_from_report'
													or (arrival.action = 'created' and arrival.actor_type = 'system'))
										))
									)
							) as exited
							where ${issue.projectId} = ${projectId}
								and ${issue.updatedAt} >= ${since} - interval '1 day'
								and exited.at >= ${since}
						`),
						resolutionOf(database, projectId, now),
						rows<{
							action: string;
							user: number;
							agent: number;
							system: number;
						}>(sql`
							select a.action as action,
								(count(*) filter (where a.actor_type = 'user'))::int as "user",
								(count(*) filter (where a.actor_type = 'agent'))::int as agent,
								(count(*) filter (where a.actor_type = 'system'))::int as system
							from ${activity} as a
							join ${issue} on ${issue.id} = a.issue_id
							where ${issue.projectId} = ${projectId} and a.created_at >= ${since}
							group by a.action
							order by a.action
						`),
						rows<{ suggested: number; dismissed: number }>(sql`
							select
								(count(*) filter (where s.created_at >= ${since}))::int as suggested,
								(count(*) filter (where s.dismissed_at >= ${since}))::int as dismissed
							from ${duplicateSuggestion} as s
							join ${issue} on ${issue.id} = s.issue_id
							where ${issue.projectId} = ${projectId}
								and (s.created_at >= ${since} or s.dismissed_at >= ${since})
						`),
						rows<{ release: string | null; count: number }>(sql`
							select ${capped(sql`a.data ->> 'release'`)} as release, count(*)::int as count
							from ${activity} as a
							join ${issue} on ${issue.id} = a.issue_id
							where ${issue.projectId} = ${projectId}
								and a.action = 'regressed' and a.created_at >= ${since}
							group by 1
							order by count desc, release nulls last
						`),
						rows<{
							name: string | null;
							version: string | null;
							reports: number;
							lastSeenAt: string;
						}>(sql`
							select ${capped(sql`${report.sdk} ->> 'name'`)} as name,
								${capped(sql`${report.sdk} ->> 'version'`)} as version,
								count(*)::int as reports, ${isoText(sql`max(${report.createdAt})`)} as "lastSeenAt"
							from ${report}
							where ${report.projectId} = ${projectId} and ${report.createdAt} >= ${since}
							group by 1, 2
							order by reports desc, max(${report.createdAt}) desc
							limit ${STATS_MAX_ROWS}
						`),
						rows<{
							release: string | null;
							reports: number;
							lastSeenAt: string;
						}>(sql`
							select ${capped(sql`${report.release}`)} as release,
								count(*)::int as reports, ${isoText(sql`max(${report.createdAt})`)} as "lastSeenAt"
							from ${report}
							where ${report.projectId} = ${projectId} and ${report.createdAt} >= ${since}
							group by 1
							order by reports desc, max(${report.createdAt}) desc
							limit ${STATS_MAX_ROWS}
						`),
						// Conversations whose last message is the reporter's, as the
						// issue list's awaitingReply. Driven from the messages, far fewer
						// than the reports.
						rows<{ waiting: number }>(sql`
							select count(distinct m.report_id)::int as waiting
							from ${reportMessage} as m
							join ${report} on ${report.id} = m.report_id
							where ${report.projectId} = ${projectId}
								and m.author_type = 'reporter'
								and not exists (
									select 1 from ${reportMessage} as later
									where later.report_id = m.report_id and later.created_at > m.created_at
								)
						`),
						// From a report sent during the period to the team's first
						// message in its thread. Reports nobody answered don't count.
						rows<{ median: number | null }>(sql`
							select (percentile_cont(0.5) within group (
								order by extract(epoch from (reply.at - ${report.createdAt}))
							))::float8 as median
							from ${report}
							cross join lateral (
								select min(m.created_at) as at
								from ${reportMessage} as m
								where m.report_id = ${report.id} and m.author_type in ('user', 'agent')
							) as reply
							where ${report.projectId} = ${projectId}
								and ${report.createdAt} >= ${since}
								and reply.at is not null
						`),
						rows<{ failed: number }>(sql`
							select count(*)::int as failed
							from ${webhookDelivery} as d
							join ${webhookEndpoint} on ${webhookEndpoint.id} = d.endpoint_id
							where ${webhookEndpoint.projectId} = ${projectId}
								and d.status = 'failed' and d.created_at >= ${since}
						`),
					],
					{ concurrency: "unbounded" },
				);

				const merged = byAction.find((a) => a.action === "marked_duplicate");
				const byDay = new Map<string, { bug: number; feature: number }>();
				const byType = { bug: 0, feature: 0 };
				for (const row of perDay) {
					const entry = byDay.get(row.day) ?? { bug: 0, feature: 0 };
					entry[row.type] += row.count;
					byType[row.type] += row.count;
					byDay.set(row.day, entry);
				}

				return {
					period: { from: from.toISOString(), to: now.toISOString(), days },
					reports: {
						total: byType.bug + byType.feature,
						byType,
						byDay: Array.from({ length: days }, (_, i) => {
							const date = utcDay(new Date(from.getTime() + i * DAY));
							return { date, ...(byDay.get(date) ?? { bug: 0, feature: 0 }) };
						}),
					},
					triage: {
						open: triage?.open ?? 0,
						oldestAgeHours: triage?.oldest
							? hours(now.getTime() - Date.parse(triage.oldest))
							: null,
						medianTimeToTriageHours: secondsToHours(
							timeToTriage?.median ?? null,
						),
					},
					resolution: {
						resolved30Days: resolution.resolved30,
						median30Days: secondsToHours(resolution.median30),
						median90Days: secondsToHours(resolution.median90),
					},
					actors: { byAction },
					duplicates: {
						suggested: duplicates?.suggested ?? 0,
						merged: merged ? merged.user + merged.agent + merged.system : 0,
						dismissed: duplicates?.dismissed ?? 0,
					},
					regressions: {
						count: regressions.reduce((n, r) => n + r.count, 0),
						byRelease: regressions.slice(0, STATS_MAX_ROWS),
					},
					sdkVersions,
					releases,
					conversations: {
						waiting: waiting?.waiting ?? 0,
						medianFirstReplyHours: secondsToHours(firstReply?.median ?? null),
					},
					webhooks: { failed: webhooks?.failed ?? 0 },
					github: {
						lastDeliveryAt:
							p.githubEnabled && p.githubLastDeliveryAt
								? p.githubLastDeliveryAt.toISOString()
								: null,
					},
				} satisfies ProjectStats;
			});

			return Stats.of({ get });
		}),
	);
}
