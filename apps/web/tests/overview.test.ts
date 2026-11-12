import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "#/db";
import { activity, issue, report } from "#/db/schema";
import { Access, type Principal } from "#/server/Access";
import { Issues } from "#/server/Issues";
import { Overview } from "#/server/Overview";
import type { IssueStatus } from "#/shared/issues";
import {
	createApiToken,
	createOrganization,
	createProject,
	createWorkspace,
	userActor,
} from "./helpers/factories";
import { run, runFailure, setupTestDatabase } from "./helpers/runtime";

setupTestDatabase();

const NOW = new Date("2026-11-12T15:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (days: number, from = NOW) =>
	new Date(from.getTime() - days * DAY);

const memberOf = (organizationId: string): Principal => ({
	kind: "user",
	userId: "user-1",
	name: "Ada",
	organizationIds: [organizationId],
});

const overviewOf = (organizationId: string, projectId: string, now = NOW) =>
	run(
		Overview.use((overview) =>
			overview.get(memberOf(organizationId), projectId, now),
		),
	);

const addReport = (
	projectId: string,
	type: "bug" | "feature",
	createdAt: Date,
) =>
	db.insert(report).values({
		projectId,
		type,
		message: "Something happened",
		pageUrl: "https://shop.example.com/",
		device: {},
		console: [],
		network: [],
		createdAt,
	});

let issueNumber = 0;
const addIssue = async (
	projectId: string,
	input: {
		status: IssueStatus;
		type?: "bug" | "feature";
		title?: string;
		createdAt?: Date;
		updatedAt?: Date;
		reportCount?: number;
		voteCount?: number;
	},
) => {
	const [row] = await db
		.insert(issue)
		.values({
			projectId,
			number: ++issueNumber,
			title: input.title ?? `Issue ${issueNumber}`,
			type: input.type ?? "bug",
			status: input.status,
			reportCount: input.reportCount ?? 0,
			voteCount: input.voteCount ?? 0,
			createdAt: input.createdAt ?? NOW,
			updatedAt: input.updatedAt ?? input.createdAt ?? NOW,
		})
		.returning();
	if (!row) throw new Error("Insert returned no row");
	return row;
};

/** An issue created at `created` and moved to Done at `done`. */
const addResolved = async (projectId: string, created: Date, done: Date) => {
	const row = await addIssue(projectId, {
		status: "done",
		createdAt: created,
		updatedAt: done,
	});
	await db.insert(activity).values({
		issueId: row.id,
		actorType: "user",
		actorName: "Ada",
		action: "updated",
		data: { changes: { status: { from: "in_progress", to: "done" } } },
		createdAt: done,
	});
	return row;
};

describe("Overview.get", () => {
	it("counts reports per UTC day over the last 30 days, bugs and requests apart", async () => {
		const { org, project: p } = await createWorkspace();
		const other = await createProject(org.id, { name: "Other app" });

		await addReport(p.id, "bug", daysAgo(0));
		await addReport(p.id, "bug", new Date("2026-11-12T00:00:01.000Z"));
		await addReport(p.id, "feature", daysAgo(0));
		await addReport(p.id, "bug", daysAgo(3));
		// First day of the chart, just after midnight UTC.
		await addReport(p.id, "feature", new Date("2026-10-14T00:00:01.000Z"));
		// The previous 30 days: counted for the comparison, not charted.
		await addReport(p.id, "bug", new Date("2026-10-13T23:59:59.000Z"));
		await addReport(p.id, "bug", daysAgo(70));
		await addReport(other.id, "bug", daysAgo(0));

		const overview = await overviewOf(org.id, p.id);

		expect(overview.days).toHaveLength(30);
		expect(overview.days[0]).toEqual({
			date: "2026-10-14",
			bugs: 0,
			features: 1,
		});
		expect(overview.days.at(-1)).toEqual({
			date: "2026-11-12",
			bugs: 2,
			features: 1,
		});
		expect(overview.days.find((d) => d.date === "2026-11-09")).toEqual({
			date: "2026-11-09",
			bugs: 1,
			features: 0,
		});
		const charted = overview.days.reduce(
			(sum, d) => sum + d.bugs + d.features,
			0,
		);
		expect(charted).toBe(5);
		expect(overview.reports).toEqual({ last30: 5, previous30: 1 });
	});

	it("gives the median time from creation to Done over 30 and 90 days", async () => {
		const { org, project: p } = await createWorkspace();

		// Last 30 days: 2 days and 1 day.
		await addResolved(p.id, daysAgo(10), daysAgo(8));
		await addResolved(p.id, daysAgo(5), daysAgo(4));
		// 31 to 90 days ago: 10 days.
		await addResolved(p.id, daysAgo(60), daysAgo(50));
		// Older than 90 days: ignored.
		await addResolved(p.id, daysAgo(120), daysAgo(100));
		// Created as Done (no move to Done): no resolution time to measure.
		await addIssue(p.id, { status: "done", createdAt: daysAgo(2) });
		// Done, then reopened: not resolved any more.
		const reopened = await addResolved(p.id, daysAgo(6), daysAgo(3));
		await db
			.update(issue)
			.set({ status: "todo" })
			.where(eq(issue.id, reopened.id));

		const { resolution } = await overviewOf(org.id, p.id);

		expect(resolution.resolved30).toBe(2);
		expect(resolution.resolved90).toBe(3);
		expect(resolution.median30).toBeCloseTo(1.5 * 86_400, 0);
		expect(resolution.median90).toBeCloseTo(2 * 86_400, 0);
	});

	it("reads the move to Done from the activity that Issues.update records", async () => {
		const { org, project: p } = await createWorkspace();
		const created = await run(
			Issues.use((issues) =>
				issues.create(p.id, { type: "bug", title: "Crash" }, userActor),
			),
		);
		await run(
			Issues.use((issues) =>
				issues.update(p.id, created.number, { status: "done" }, userActor),
			),
		);

		const { resolution } = await overviewOf(
			org.id,
			p.id,
			new Date(Date.now() + 60_000),
		);
		expect(resolution.resolved30).toBe(1);
		expect(resolution.median30).toBeGreaterThanOrEqual(0);
		expect(resolution.median30).toBeLessThan(60);
	});

	it("counts issues by status and lists the most reported and most voted open ones", async () => {
		const { org, project: p } = await createWorkspace();
		await addIssue(p.id, { status: "triage", createdAt: daysAgo(4) });
		await addIssue(p.id, { status: "triage", createdAt: daysAgo(1) });
		await addIssue(p.id, {
			status: "todo",
			title: "Login loop",
			reportCount: 9,
		});
		await addIssue(p.id, {
			status: "in_progress",
			title: "Slow search",
			reportCount: 4,
		});
		await addIssue(p.id, { status: "done", title: "Fixed", reportCount: 50 });
		await addIssue(p.id, {
			status: "backlog",
			type: "feature",
			title: "Dark mode",
			voteCount: 12,
			reportCount: 2,
		});
		await addIssue(p.id, {
			status: "canceled",
			type: "feature",
			title: "Declined",
			voteCount: 40,
		});

		const overview = await overviewOf(org.id, p.id);

		expect(overview.statuses).toMatchObject({
			triage: 2,
			backlog: 1,
			todo: 1,
			in_progress: 1,
			in_review: 0,
			done: 1,
			canceled: 1,
		});
		expect(overview.oldestTriageAt).toBe(daysAgo(4).toISOString());
		expect(overview.topReported.map((i) => [i.title, i.reportCount])).toEqual([
			["Login loop", 9],
			["Slow search", 4],
			["Dark mode", 2],
		]);
		expect(overview.topVoted.map((i) => [i.title, i.voteCount])).toEqual([
			["Dark mode", 12],
		]);
	});

	it("is empty but complete for a new project", async () => {
		const { org, project: p } = await createWorkspace();
		const overview = await overviewOf(org.id, p.id);
		expect(overview.days).toHaveLength(30);
		expect(overview.days.every((d) => d.bugs === 0 && d.features === 0)).toBe(
			true,
		);
		expect(overview.reports).toEqual({ last30: 0, previous30: 0 });
		expect(overview.oldestTriageAt).toBeNull();
		expect(overview.topReported).toEqual([]);
		expect(overview.topVoted).toEqual([]);
		expect(overview.resolution).toEqual({
			median30: null,
			median90: null,
			resolved30: 0,
			resolved90: 0,
		});
	});

	it("is NotFound outside the caller's organizations", async () => {
		const { project: p } = await createWorkspace();
		const stranger = await createOrganization("Elsewhere");
		await addReport(p.id, "bug", daysAgo(0));

		const asStranger = await runFailure(
			Overview.use((overview) => overview.get(memberOf(stranger.id), p.id)),
		);
		expect(asStranger._tag).toBe("NotFound");

		const { token } = await createApiToken(stranger.id);
		const tokenPrincipal = await run(
			Access.use((access) => access.fromToken(token)),
		);
		const asToken = await runFailure(
			Overview.use((overview) => overview.get(tokenPrincipal, p.id)),
		);
		expect(asToken._tag).toBe("NotFound");

		const noOrganization: Principal = {
			kind: "user",
			userId: "user-2",
			name: "Bob",
			organizationIds: [],
		};
		const asNobody = await runFailure(
			Overview.use((overview) => overview.get(noOrganization, p.id)),
		);
		expect(asNobody._tag).toBe("NotFound");
	});

	it("lets an API token of the project's organization read it", async () => {
		const { org, project: p } = await createWorkspace();
		const { token } = await createApiToken(org.id, { canWrite: false });
		const principal = await run(
			Access.use((access) => access.fromToken(token)),
		);
		const overview = await run(
			Overview.use((o) => o.get(principal, p.id, NOW)),
		);
		expect(overview.days).toHaveLength(30);
	});
});
