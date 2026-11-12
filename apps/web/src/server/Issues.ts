import {
	and,
	asc,
	desc,
	eq,
	gt,
	ilike,
	inArray,
	isNotNull,
	type SQL,
	sql,
} from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import {
	activity,
	comment,
	issue,
	issueVote,
	type Json,
	type JsonObject,
	project,
	report,
} from "#/db/schema";
import {
	ISSUE_STATUSES,
	type IssueStatus,
	type IssueType,
	PRIORITY_LABELS,
} from "#/shared/issues";
import type { Actor } from "./Access";
import { Database } from "./Database";
import { env } from "./env";
import { type DbError, InvalidInput, NotFound } from "./errors";
import { sendMail } from "./mailer";
import { Storage } from "./Storage";
import { Webhooks } from "./Webhooks";

const toJson = (value: unknown): Json =>
	JSON.parse(JSON.stringify(value ?? null)) as Json;

export { ISSUE_STATUSES, type IssueStatus, type IssueType, PRIORITY_LABELS };

type IssueRow = typeof issue.$inferSelect;
type ReportRow = typeof report.$inferSelect;

export const issueDto = (row: IssueRow) => ({
	id: row.id,
	number: row.number,
	type: row.type,
	title: row.title,
	description: row.description,
	status: row.status,
	priority: row.priority,
	priorityLabel: PRIORITY_LABELS[row.priority] ?? "none",
	labels: row.labels,
	assignee: row.assigneeType
		? { type: row.assigneeType, id: row.assigneeId, name: row.assigneeName }
		: null,
	duplicateOfId: row.duplicateOfId,
	prUrl: row.prUrl,
	reportCount: row.reportCount,
	voteCount: row.voteCount,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});
export type IssueDto = ReturnType<typeof issueDto>;

/** The newest report of an issue, enough to show who and what in a list row. */
export type ReportSummary = {
	id: string;
	message: string;
	reporter: { id?: string; email?: string; name?: string } | null;
	hasScreenshot: boolean;
	consoleErrors: number;
	failedRequests: number;
	pageUrl: string;
	release: string | null;
	createdAt: string;
};
export type IssueListItem = IssueDto & { lastReport: ReportSummary | null };

export type IssuePatch = {
	title?: string;
	description?: string;
	status?: IssueStatus;
	priority?: number;
	labels?: string[];
	assignee?: { type: "user" | "agent"; id: string | null; name: string } | null;
	prUrl?: string | null;
};

export type IssueFilter = {
	projectId: string;
	statuses?: ReadonlyArray<IssueStatus>;
	type?: IssueType;
	query?: string;
	/** Issues with at least one report from this release. */
	release?: string;
	limit?: number;
	offset?: number;
};

const titleFromMessage = (message: string) => {
	const firstLine = message.trim().split("\n")[0] ?? "";
	return firstLine.length > 90
		? `${firstLine.slice(0, 87)}…`
		: firstLine || "Untitled";
};

export class Issues extends Context.Service<
	Issues,
	{
		readonly list: (
			filter: IssueFilter,
		) => Effect.Effect<IssueListItem[], DbError>;
		readonly counts: (
			projectId: string,
		) => Effect.Effect<Record<IssueStatus, number>, DbError>;
		readonly search: (
			projectId: string,
			query: string,
			limit?: number,
			release?: string,
		) => Effect.Effect<IssueDto[], DbError>;
		/** Releases the project's reports came from, most recently seen first. */
		readonly releases: (projectId: string) => Effect.Effect<string[], DbError>;
		readonly get: (
			projectId: string,
			number: number,
		) => Effect.Effect<IssueDetail, NotFound | DbError>;
		readonly getReport: (
			projectId: string,
			reportId: string,
		) => Effect.Effect<ReportDto, NotFound | DbError>;
		readonly create: (
			projectId: string,
			input: {
				type: IssueType;
				title: string;
				description?: string;
				status?: IssueStatus;
				priority?: number;
				labels?: string[];
			},
			actor: Actor,
		) => Effect.Effect<IssueDto, InvalidInput | DbError>;
		readonly createFromReport: (
			projectId: string,
			reportRow: ReportRow,
		) => Effect.Effect<IssueDto, DbError>;
		readonly update: (
			projectId: string,
			number: number,
			patch: IssuePatch,
			actor: Actor,
		) => Effect.Effect<IssueDto, NotFound | InvalidInput | DbError>;
		readonly addComment: (
			projectId: string,
			number: number,
			body: string,
			actor: Actor,
		) => Effect.Effect<CommentDto, NotFound | InvalidInput | DbError>;
		readonly markDuplicate: (
			projectId: string,
			number: number,
			duplicateOfNumber: number,
			actor: Actor,
		) => Effect.Effect<IssueDto, NotFound | InvalidInput | DbError>;
		readonly moveReport: (
			projectId: string,
			reportId: string,
			toNumber: number,
			actor: Actor,
		) => Effect.Effect<IssueDto, NotFound | DbError>;
	}
>()("tattle/server/Issues") {
	static readonly layer = Layer.effect(
		Issues,
		Effect.gen(function* () {
			const database = yield* Database;
			const storage = yield* Storage;
			const webhooks = yield* Webhooks;

			const reportDto = (row: ReportRow) => ({
				id: row.id,
				issueId: row.issueId,
				type: row.type,
				message: row.message,
				screenshotUrl: row.screenshotKey
					? storage.signedUrl(row.screenshotKey)
					: null,
				screenshotKey: row.screenshotKey,
				pageUrl: row.pageUrl,
				pageTitle: row.pageTitle,
				reporter: row.reporter,
				context: row.context,
				device: row.device,
				console: row.console,
				network: row.network,
				breadcrumbs: row.breadcrumbs,
				release: row.release,
				createdAt: row.createdAt.toISOString(),
			});

			const findIssue = Effect.fn("Issues.findIssue")(function* (
				projectId: string,
				number: number,
			) {
				const [row] = yield* database.query((db) =>
					db
						.select()
						.from(issue)
						.where(
							and(eq(issue.projectId, projectId), eq(issue.number, number)),
						),
				);
				if (!row)
					return yield* new NotFound({ message: `Issue #${number} not found` });
				return row;
			});

			const logActivity = (
				issueId: string,
				actor: Actor,
				action: string,
				data?: JsonObject,
			) =>
				database.query((db) =>
					db.insert(activity).values({
						issueId,
						actorType: actor.type,
						actorId: actor.id,
						actorName: actor.name,
						action,
						data,
					}),
				);

			const recountReports = (issueIds: string[]) =>
				issueIds.length === 0
					? Effect.void
					: database.query((db) =>
							db
								.update(issue)
								.set({
									reportCount: sql`(select count(*) from ${report} where ${report.issueId} = ${issue.id})::int`,
								})
								.where(inArray(issue.id, issueIds)),
						);

			const seenInRelease = (release: string) =>
				sql`exists (select 1 from ${report} where ${report.issueId} = ${issue.id} and ${report.release} = ${release})`;

			// A bug that was done gets a report sent after it was marked done: it
			// is back. Reopen it, and say in which release it came back.
			const reopenIfRegressed = Effect.fn("Issues.reopenIfRegressed")(
				function* (projectId: string, target: IssueRow, reportIds: string[]) {
					if (
						target.status !== "done" ||
						target.type !== "bug" ||
						reportIds.length === 0
					)
						return;
					const [marked] = yield* database.query((db) =>
						db
							.select({ at: activity.createdAt })
							.from(activity)
							.where(
								and(
									eq(activity.issueId, target.id),
									eq(activity.action, "updated"),
									sql`${activity.data}->'changes'->'status'->>'to' = 'done'`,
								),
							)
							.orderBy(desc(activity.createdAt))
							.limit(1),
					);
					// Created as done, from the dashboard or by an agent.
					const doneAt = marked?.at ?? target.createdAt;
					const [newest] = yield* database.query((db) =>
						db
							.select({ id: report.id, release: report.release })
							.from(report)
							.where(
								and(
									inArray(report.id, reportIds),
									gt(report.createdAt, doneAt),
								),
							)
							.orderBy(desc(report.createdAt))
							.limit(1),
					);
					if (!newest) return;
					const [reopened] = yield* database.query((db) =>
						db
							.update(issue)
							.set({ status: "todo" })
							.where(eq(issue.id, target.id))
							.returning(),
					);
					const system: Actor = { type: "system", id: null, name: "Tattle" };
					const regression = { reportId: newest.id, release: newest.release };
					yield* logActivity(target.id, system, "regressed", {
						...regression,
						changes: { status: { from: "done", to: "todo" } },
					});
					yield* webhooks.emit(projectId, "issue.updated", {
						issue: issueDto(reopened as IssueRow),
						changes: { status: { from: "done", to: "todo" } },
						regression,
						actor: system,
					});
				},
			);

			const list = Effect.fn("Issues.list")(function* (filter: IssueFilter) {
				const conditions: SQL[] = [eq(issue.projectId, filter.projectId)];
				if (filter.statuses?.length)
					conditions.push(inArray(issue.status, [...filter.statuses]));
				if (filter.type) conditions.push(eq(issue.type, filter.type));
				if (filter.query)
					conditions.push(ilike(issue.title, `%${filter.query}%`));
				if (filter.release) conditions.push(seenInRelease(filter.release));
				const rows = yield* database.query((db) =>
					db
						.select()
						.from(issue)
						.where(and(...conditions))
						.orderBy(desc(issue.updatedAt))
						.limit(Math.min(filter.limit ?? 50, 200))
						.offset(filter.offset ?? 0),
				);
				if (rows.length === 0) return [];
				const latest = yield* database.query((db) =>
					db
						.selectDistinctOn([report.issueId], {
							issueId: report.issueId,
							id: report.id,
							message: report.message,
							reporter: report.reporter,
							screenshotKey: report.screenshotKey,
							pageUrl: report.pageUrl,
							release: report.release,
							createdAt: report.createdAt,
							consoleErrors: sql<number>`(select count(*) from jsonb_array_elements(${report.console}) as e where e->>'level' = 'error')::int`,
							failedRequests: sql<number>`(select count(*) from jsonb_array_elements(${report.network}) as n where (n->>'status')::int = 0 or (n->>'status')::int >= 400)::int`,
						})
						.from(report)
						.where(
							inArray(
								report.issueId,
								rows.map((r) => r.id),
							),
						)
						.orderBy(report.issueId, desc(report.createdAt)),
				);
				const byIssue = new Map(latest.map((r) => [r.issueId, r]));
				return rows.map((row): IssueListItem => {
					const last = byIssue.get(row.id);
					return {
						...issueDto(row),
						lastReport: last
							? {
									id: last.id,
									message: last.message,
									reporter: last.reporter
										? {
												id: last.reporter.id,
												email: last.reporter.email,
												name: last.reporter.name,
											}
										: null,
									hasScreenshot: last.screenshotKey !== null,
									consoleErrors: last.consoleErrors,
									failedRequests: last.failedRequests,
									pageUrl: last.pageUrl,
									release: last.release,
									createdAt: last.createdAt.toISOString(),
								}
							: null,
					};
				});
			});

			const counts = Effect.fn("Issues.counts")(function* (projectId: string) {
				const rows = yield* database.query((db) =>
					db
						.select({ status: issue.status, count: sql<number>`count(*)::int` })
						.from(issue)
						.where(eq(issue.projectId, projectId))
						.groupBy(issue.status),
				);
				const result = Object.fromEntries(
					ISSUE_STATUSES.map((s) => [s, 0]),
				) as Record<IssueStatus, number>;
				for (const row of rows) result[row.status] = row.count;
				return result;
			});

			// Keyword search over issue titles, descriptions and the messages of
			// their reports. Agents use it to find duplicates, then judge themselves.
			const search = Effect.fn("Issues.search")(function* (
				projectId: string,
				query: string,
				limit = 10,
				release?: string,
			) {
				const words = query
					.toLowerCase()
					.split(/[^\p{L}\p{N}]+/u)
					.filter((w) => w.length >= 3)
					.slice(0, 12);
				if (words.length === 0) return [];
				const score = sql.join(
					words.map(
						(w) =>
							sql`(case when ${issue.title} ilike ${`%${w}%`} then 3 else 0 end
							+ case when ${issue.description} ilike ${`%${w}%`} then 1 else 0 end
							+ case when exists (select 1 from ${report} where ${report.issueId} = ${issue.id} and ${report.message} ilike ${`%${w}%`}) then 2 else 0 end)`,
					),
					sql` + `,
				);
				const rows = yield* database.query((db) =>
					db
						.select({ issue, score: sql<number>`(${score})::int`.as("score") })
						.from(issue)
						.where(
							and(
								eq(issue.projectId, projectId),
								release ? seenInRelease(release) : undefined,
							),
						)
						.orderBy(desc(sql`score`), desc(issue.updatedAt))
						.limit(Math.min(limit, 50)),
				);
				return rows.filter((r) => r.score > 0).map((r) => issueDto(r.issue));
			});

			const releases = Effect.fn("Issues.releases")(function* (
				projectId: string,
			) {
				const rows = yield* database.query((db) =>
					db
						.select({ release: report.release })
						.from(report)
						.where(
							and(eq(report.projectId, projectId), isNotNull(report.release)),
						)
						.groupBy(report.release)
						.orderBy(desc(sql`max(${report.createdAt})`))
						.limit(100),
				);
				return rows.flatMap((r) => (r.release ? [r.release] : []));
			});

			const get = Effect.fn("Issues.get")(function* (
				projectId: string,
				number: number,
			) {
				const row = yield* findIssue(projectId, number);
				const [reports, comments, events, seenIn] = yield* Effect.all(
					[
						database.query((db) =>
							db
								.select()
								.from(report)
								.where(eq(report.issueId, row.id))
								.orderBy(desc(report.createdAt))
								.limit(50),
						),
						database.query((db) =>
							db
								.select()
								.from(comment)
								.where(eq(comment.issueId, row.id))
								.orderBy(asc(comment.createdAt)),
						),
						database.query((db) =>
							db
								.select()
								.from(activity)
								.where(eq(activity.issueId, row.id))
								.orderBy(asc(activity.createdAt)),
						),
						database.query((db) =>
							db
								.select({
									release: report.release,
									firstSeen: sql`min(${report.createdAt})`.mapWith(
										report.createdAt,
									),
									lastSeen: sql`max(${report.createdAt})`.mapWith(
										report.createdAt,
									),
									reports: sql<number>`count(*)::int`,
								})
								.from(report)
								.where(
									and(eq(report.issueId, row.id), isNotNull(report.release)),
								)
								.groupBy(report.release)
								.orderBy(sql`min(${report.createdAt})`),
						),
					],
					{ concurrency: "unbounded" },
				);
				let duplicateOf: IssueDto | null = null;
				if (row.duplicateOfId) {
					const [dup] = yield* database.query((db) =>
						db
							.select()
							.from(issue)
							.where(eq(issue.id, row.duplicateOfId as string)),
					);
					duplicateOf = dup ? issueDto(dup) : null;
				}
				return {
					issue: issueDto(row),
					duplicateOf,
					reports: reports.map(reportDto),
					comments: comments.map(commentDto),
					releases: seenIn.map((r) => ({
						release: r.release as string,
						firstSeen: (r.firstSeen as Date).toISOString(),
						lastSeen: (r.lastSeen as Date).toISOString(),
						reports: r.reports,
					})),
					activity: events.map((e) => ({
						id: e.id,
						actor: { type: e.actorType, id: e.actorId, name: e.actorName },
						action: e.action,
						data: e.data,
						createdAt: e.createdAt.toISOString(),
					})),
				};
			});

			const getReport = Effect.fn("Issues.getReport")(function* (
				projectId: string,
				reportId: string,
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
				return reportDto(row);
			});

			const insertIssue = (
				projectId: string,
				values: Omit<typeof issue.$inferInsert, "projectId" | "number">,
			) =>
				database.transaction(async (tx) => {
					const [counter] = await tx
						.update(project)
						.set({ issueCounter: sql`${project.issueCounter} + 1` })
						.where(eq(project.id, projectId))
						.returning({ value: project.issueCounter });
					if (!counter) throw new Error(`Project ${projectId} not found`);
					const [created] = await tx
						.insert(issue)
						.values({ ...values, projectId, number: counter.value })
						.returning();
					return created as IssueRow;
				});

			const create = Effect.fn("Issues.create")(function* (
				projectId: string,
				input: {
					type: IssueType;
					title: string;
					description?: string;
					status?: IssueStatus;
					priority?: number;
					labels?: string[];
				},
				actor: Actor,
			) {
				const title = input.title.trim();
				if (!title)
					return yield* new InvalidInput({ message: "Title is required" });
				const row = yield* insertIssue(projectId, {
					type: input.type,
					title,
					description: input.description ?? "",
					status: input.status ?? "backlog",
					priority: input.priority ?? 0,
					labels: input.labels ?? [],
				});
				yield* logActivity(row.id, actor, "created");
				const dto = issueDto(row);
				yield* webhooks.emit(projectId, "issue.created", { issue: dto, actor });
				return dto;
			});

			const createFromReport = Effect.fn("Issues.createFromReport")(function* (
				projectId: string,
				reportRow: ReportRow,
			) {
				const row = yield* insertIssue(projectId, {
					type: reportRow.type,
					title: titleFromMessage(reportRow.message),
					description: reportRow.message,
					status: "triage",
					reportCount: 1,
				});
				yield* database.query((db) =>
					db
						.update(report)
						.set({ issueId: row.id })
						.where(eq(report.id, reportRow.id)),
				);
				const system: Actor = { type: "system", id: null, name: "Widget" };
				yield* logActivity(row.id, system, "created_from_report", {
					reportId: reportRow.id,
				});
				const dto = issueDto(row);
				yield* webhooks.emit(projectId, "issue.created", {
					issue: dto,
					reportId: reportRow.id,
					actor: system,
				});
				return dto;
			});

			// Everyone who asked for a feature (widget reports, portal votes with an
			// email) hears about it once it ships. Needs SMTP; silent otherwise.
			const notifyShipped = Effect.fn("Issues.notifyShipped")(
				function* (issueId: string) {
					const [row] = yield* database.query((db) =>
						db
							.select({
								title: issue.title,
								project: project.name,
								portalSlug: project.portalSlug,
								portalEnabled: project.portalEnabled,
							})
							.from(issue)
							.innerJoin(project, eq(project.id, issue.projectId))
							.where(eq(issue.id, issueId)),
					);
					if (!row) return;
					const people = yield* database.query((db) =>
						db.execute<{ email: string; name: string | null }>(sql`
							select distinct on (lower(email)) email, name from (
								select ${report.reporter}->>'email' as email, ${report.reporter}->>'name' as name
								from ${report} where ${report.issueId} = ${issueId}
								union all
								select ${issueVote.email}, null from ${issueVote}
								where ${issueVote.issueId} = ${issueId}
							) asked
							where email is not null and email <> ''
						`),
					);
					const link =
						row.portalEnabled && row.portalSlug
							? `${env.baseUrl}/portal/${row.portalSlug}?shipped=true`
							: undefined;
					for (const person of people.rows) {
						yield* Effect.tryPromise(() =>
							sendMail({
								to: person.email,
								subject: `Shipped: ${row.title}`,
								text: `Hi${person.name ? ` ${person.name}` : ""},\n\nYou asked ${row.project} for “${row.title}”. It's now available.\n\nThanks for taking the time to ask: it's how we decide what to build next.`,
								action: link
									? { label: "See what else is coming", url: link }
									: undefined,
							}),
						).pipe(Effect.ignore);
					}
					yield* Effect.logInfo(
						`Shipped notice for “${row.title}” sent to ${people.rows.length} people`,
					);
				},
				Effect.catch((error) =>
					Effect.logError("Shipped notice failed", error),
				),
			);

			const update = Effect.fn("Issues.update")(function* (
				projectId: string,
				number: number,
				patch: IssuePatch,
				actor: Actor,
			) {
				const current = yield* findIssue(projectId, number);
				const set: Partial<typeof issue.$inferInsert> = {};
				const changes: JsonObject = {};
				const track = <K extends keyof IssueRow>(key: K, to: IssueRow[K]) => {
					if (JSON.stringify(current[key]) !== JSON.stringify(to)) {
						(set as Record<string, unknown>)[key] = to;
						changes[key] = { from: toJson(current[key]), to: toJson(to) };
					}
				};

				if (patch.title !== undefined) {
					if (!patch.title.trim())
						return yield* new InvalidInput({
							message: "Title cannot be empty",
						});
					track("title", patch.title.trim());
				}
				if (patch.description !== undefined)
					track("description", patch.description);
				if (patch.status !== undefined) {
					if (patch.status === "duplicate") {
						return yield* new InvalidInput({
							message: "Use mark_duplicate to mark an issue as a duplicate",
						});
					}
					track("status", patch.status);
					if (current.status === "duplicate") track("duplicateOfId", null);
				}
				if (patch.priority !== undefined) {
					if (
						!Number.isInteger(patch.priority) ||
						patch.priority < 0 ||
						patch.priority > 4
					) {
						return yield* new InvalidInput({
							message: "Priority must be an integer from 0 to 4",
						});
					}
					track("priority", patch.priority);
				}
				if (patch.labels !== undefined) {
					track("labels", [
						...new Set(
							patch.labels.map((l) => l.trim().toLowerCase()).filter(Boolean),
						),
					]);
				}
				if (patch.assignee !== undefined) {
					track("assigneeType", patch.assignee?.type ?? null);
					track("assigneeId", patch.assignee?.id ?? null);
					track("assigneeName", patch.assignee?.name ?? null);
				}
				if (patch.prUrl !== undefined) track("prUrl", patch.prUrl);

				if (Object.keys(changes).length === 0) return issueDto(current);

				const [updated] = yield* database.query((db) =>
					db.update(issue).set(set).where(eq(issue.id, current.id)).returning(),
				);
				yield* logActivity(current.id, actor, "updated", { changes });
				const dto = issueDto(updated as IssueRow);
				yield* webhooks.emit(projectId, "issue.updated", {
					issue: dto,
					changes,
					actor,
				});
				if (
					current.type === "feature" &&
					current.status !== "done" &&
					patch.status === "done"
				) {
					yield* notifyShipped(current.id).pipe(Effect.forkDetach);
				}
				return dto;
			});

			const addComment = Effect.fn("Issues.addComment")(function* (
				projectId: string,
				number: number,
				body: string,
				actor: Actor,
			) {
				if (!body.trim())
					return yield* new InvalidInput({
						message: "Comment cannot be empty",
					});
				const current = yield* findIssue(projectId, number);
				const [row] = yield* database.query((db) =>
					db
						.insert(comment)
						.values({
							issueId: current.id,
							authorType: actor.type,
							authorId: actor.id,
							authorName: actor.name,
							body: body.trim(),
						})
						.returning(),
				);
				yield* database.query((db) =>
					db
						.update(issue)
						.set({ updatedAt: new Date() })
						.where(eq(issue.id, current.id)),
				);
				const dto = commentDto(row as typeof comment.$inferSelect);
				yield* webhooks.emit(projectId, "comment.created", {
					issue: issueDto(current),
					comment: dto,
					actor,
				});
				return dto;
			});

			// Marks `number` as a duplicate of `duplicateOfNumber` and moves its
			// reports to the original, so the original keeps every reporter.
			const markDuplicate = Effect.fn("Issues.markDuplicate")(function* (
				projectId: string,
				number: number,
				duplicateOfNumber: number,
				actor: Actor,
			) {
				if (number === duplicateOfNumber) {
					return yield* new InvalidInput({
						message: "An issue cannot duplicate itself",
					});
				}
				const duplicate = yield* findIssue(projectId, number);
				const original = yield* findIssue(projectId, duplicateOfNumber);
				if (original.status === "duplicate") {
					return yield* new InvalidInput({
						message: `#${duplicateOfNumber} is itself a duplicate; use its original instead`,
					});
				}
				const moved = yield* database.query((db) =>
					db
						.update(report)
						.set({ issueId: original.id })
						.where(eq(report.issueId, duplicate.id))
						.returning({ id: report.id }),
				);
				// Recount first so the returned issue shows its new (empty) count.
				yield* recountReports([duplicate.id, original.id]);
				const [updated] = yield* database.query((db) =>
					db
						.update(issue)
						.set({ status: "duplicate", duplicateOfId: original.id })
						.where(eq(issue.id, duplicate.id))
						.returning(),
				);
				yield* logActivity(duplicate.id, actor, "marked_duplicate", {
					duplicateOf: original.number,
				});
				yield* logActivity(original.id, actor, "merged_duplicate", {
					from: duplicate.number,
				});
				yield* reopenIfRegressed(
					projectId,
					original,
					moved.map((r) => r.id),
				);
				const [originalAfter] = yield* database.query((db) =>
					db.select().from(issue).where(eq(issue.id, original.id)),
				);
				const dto = issueDto(updated as IssueRow);
				yield* webhooks.emit(projectId, "issue.updated", {
					issue: dto,
					changes: { status: { from: duplicate.status, to: "duplicate" } },
					duplicateOf: originalAfter ? issueDto(originalAfter) : null,
					actor,
				});
				return dto;
			});

			const moveReport = Effect.fn("Issues.moveReport")(function* (
				projectId: string,
				reportId: string,
				toNumber: number,
				actor: Actor,
			) {
				const target = yield* findIssue(projectId, toNumber);
				const [row] = yield* database.query((db) =>
					db
						.select()
						.from(report)
						.where(
							and(eq(report.projectId, projectId), eq(report.id, reportId)),
						),
				);
				if (!row) return yield* new NotFound({ message: "Report not found" });
				yield* database.query((db) =>
					db
						.update(report)
						.set({ issueId: target.id })
						.where(eq(report.id, reportId)),
				);
				yield* recountReports([
					target.id,
					...(row.issueId ? [row.issueId] : []),
				]);
				yield* logActivity(target.id, actor, "report_attached", { reportId });
				yield* reopenIfRegressed(projectId, target, [reportId]);
				const [after] = yield* database.query((db) =>
					db.select().from(issue).where(eq(issue.id, target.id)),
				);
				return issueDto(after as IssueRow);
			});

			return Issues.of({
				list,
				counts,
				search,
				releases,
				get,
				getReport,
				create,
				createFromReport,
				update,
				addComment,
				markDuplicate,
				moveReport,
			});
		}),
	);
}

const commentDto = (row: typeof comment.$inferSelect) => ({
	id: row.id,
	author: { type: row.authorType, id: row.authorId, name: row.authorName },
	body: row.body,
	createdAt: row.createdAt.toISOString(),
});
export type CommentDto = ReturnType<typeof commentDto>;

export type ReportDto = {
	id: string;
	issueId: string | null;
	type: IssueType;
	message: string;
	screenshotUrl: string | null;
	screenshotKey: string | null;
	pageUrl: string;
	pageTitle: string | null;
	reporter: ReportRow["reporter"];
	context: ReportRow["context"];
	device: ReportRow["device"];
	console: ReportRow["console"];
	network: ReportRow["network"];
	breadcrumbs: ReportRow["breadcrumbs"];
	release: string | null;
	createdAt: string;
};

/** A release an issue was reported from, with when it was first and last seen. */
export type SeenInRelease = {
	release: string;
	firstSeen: string;
	lastSeen: string;
	reports: number;
};

export type IssueDetail = {
	issue: IssueDto;
	duplicateOf: IssueDto | null;
	reports: ReportDto[];
	comments: CommentDto[];
	/** Oldest first. */
	releases: SeenInRelease[];
	activity: Array<{
		id: string;
		actor: {
			type: "user" | "agent" | "system";
			id: string | null;
			name: string;
		};
		action: string;
		data: JsonObject | null;
		createdAt: string;
	}>;
};
