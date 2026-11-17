import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "#/db";
import {
	activity,
	duplicateSuggestion,
	issue,
	project,
	report,
	reportMessage,
	webhookDelivery,
} from "#/db/schema";
import type { IssueStatus } from "#/shared/issues";
import {
	createApiToken,
	createProject,
	createWebhookEndpoint,
	createWorkspace,
} from "./helpers/factories";
import { call, type JsonRpcResponse } from "./helpers/mcp";
import { setupTestDatabase } from "./helpers/runtime";

setupTestDatabase();

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const utcDay = (date: Date) => date.toISOString().slice(0, 10);

const REPORTER = {
	id: "user-42",
	email: "ada@example.com",
	name: "Ada Lovelace",
};
const MESSAGE = "My card number is in this message";
const PAGE = "https://shop.example.com/account/private-page";

const addReport = async (
	projectId: string,
	input: {
		type?: "bug" | "feature";
		createdAt: Date;
		sdk?: { name: string; version: string } | null;
		release?: string | null;
	},
) => {
	const [row] = await db
		.insert(report)
		.values({
			projectId,
			type: input.type ?? "bug",
			message: MESSAGE,
			pageUrl: PAGE,
			pageTitle: "Private page",
			reporter: REPORTER,
			verifiedUserId: REPORTER.id,
			device: {},
			console: [],
			network: [],
			sdk: input.sdk ?? null,
			release: input.release ?? null,
			createdAt: input.createdAt,
		})
		.returning();
	if (!row) throw new Error("Insert returned no row");
	return row;
};

let issueNumber = 0;
const addIssue = async (
	projectId: string,
	input: { status: IssueStatus; createdAt: Date; updatedAt?: Date },
) => {
	const [row] = await db
		.insert(issue)
		.values({
			projectId,
			number: ++issueNumber,
			title: "Checkout fails for Ada Lovelace",
			status: input.status,
			createdAt: input.createdAt,
			updatedAt: input.updatedAt ?? input.createdAt,
		})
		.returning();
	if (!row) throw new Error("Insert returned no row");
	return row;
};

const ACTORS = {
	user: { actorType: "user", actorId: "user-1", actorName: "Ada" },
	agent: { actorType: "agent", actorId: "token-1", actorName: "Triage bot" },
	system: { actorType: "system", actorId: null, actorName: "Widget" },
} as const;

const log = (
	issueId: string,
	actor: keyof typeof ACTORS,
	action: string,
	createdAt: Date,
	data?: Record<string, unknown>,
) =>
	db.insert(activity).values({
		issueId,
		...ACTORS[actor],
		action,
		data: data as never,
		createdAt,
	});

const statusChange = (from: IssueStatus, to: IssueStatus) => ({
	changes: { status: { from, to } },
});

const stats = (message: JsonRpcResponse) => {
	expect(message.result?.isError).toBeFalsy();
	return JSON.parse(message.result?.content?.[0]?.text ?? "{}");
};

/**
 * One project with a bit of everything, relative to `now`: what's inside the
 * default 30 days is at most 5 days old, what's outside at least 40.
 */
const seed = async () => {
	const now = new Date();
	const ago = (ms: number) => new Date(now.getTime() - ms);
	const { org, project: p } = await createWorkspace();
	const sibling = await createProject(org.id, { name: "Other app" });
	await db
		.update(project)
		.set({ githubEnabled: true, githubLastDeliveryAt: ago(3 * HOUR) })
		.where(eq(project.id, p.id));

	// Reports: 2 bugs and 2 requests in the period, 1 bug before it.
	const widget = "@tattlehq/widget";
	const r1 = await addReport(p.id, {
		createdAt: ago(HOUR),
		sdk: { name: widget, version: "1.2.0" },
		release: "2.0.0",
	});
	const r2 = await addReport(p.id, {
		createdAt: ago(2 * DAY),
		sdk: { name: widget, version: "1.2.0" },
		release: "2.0.0",
	});
	const r3 = await addReport(p.id, {
		type: "feature",
		createdAt: ago(3 * DAY),
		sdk: { name: widget, version: "1.1.0" },
		release: "1.9.0",
	});
	const r5 = await addReport(p.id, {
		type: "feature",
		createdAt: ago(5 * DAY),
		release: "x".repeat(300),
	});
	const r4 = await addReport(p.id, {
		createdAt: ago(40 * DAY),
		sdk: { name: "@tattlehq/react-native", version: "0.9.0" },
		release: "1.0.0",
	});
	await addReport(sibling.id, {
		createdAt: ago(HOUR),
		sdk: { name: widget, version: "9.9.9" },
		release: "9.9.9",
	});

	// Triage: A and B are still there, B for 50 hours.
	const a = await addIssue(p.id, {
		status: "triage",
		createdAt: ago(10 * HOUR),
	});
	await log(a.id, "system", "created_from_report", ago(10 * HOUR));
	const b = await addIssue(p.id, {
		status: "triage",
		createdAt: ago(50 * HOUR),
	});
	await log(b.id, "system", "created_from_report", ago(50 * HOUR));
	// C left Triage after 2 hours (agent), D after 4 (merged by the agent),
	// G after 6 (a person), then G was done 6 hours later.
	const c = await addIssue(p.id, {
		status: "backlog",
		createdAt: ago(20 * HOUR),
		updatedAt: ago(18 * HOUR),
	});
	await log(c.id, "system", "created_from_report", ago(20 * HOUR));
	await log(
		c.id,
		"agent",
		"updated",
		ago(18 * HOUR),
		statusChange("triage", "backlog"),
	);
	const g = await addIssue(p.id, {
		status: "done",
		createdAt: ago(60 * HOUR),
		updatedAt: ago(14 * HOUR),
	});
	await log(g.id, "system", "created_from_report", ago(60 * HOUR));
	await log(
		g.id,
		"user",
		"updated",
		ago(54 * HOUR),
		statusChange("triage", "backlog"),
	);
	await log(
		g.id,
		"user",
		"updated",
		ago(48 * HOUR),
		statusChange("backlog", "done"),
	);
	const d = await addIssue(p.id, {
		status: "duplicate",
		createdAt: ago(30 * HOUR),
		updatedAt: ago(26 * HOUR),
	});
	await log(d.id, "system", "created_from_report", ago(30 * HOUR));
	await log(d.id, "agent", "marked_duplicate", ago(26 * HOUR), {
		duplicateOf: g.number,
	});
	await log(g.id, "agent", "merged_duplicate", ago(26 * HOUR), {
		from: d.number,
	});
	// E was created by a person straight into the backlog: merging it is no
	// move out of Triage.
	const e = await addIssue(p.id, {
		status: "duplicate",
		createdAt: ago(15 * HOUR),
		updatedAt: ago(14 * HOUR),
	});
	await log(e.id, "user", "created", ago(15 * HOUR));
	await log(e.id, "user", "marked_duplicate", ago(14 * HOUR), {
		duplicateOf: g.number,
	});
	await log(g.id, "user", "merged_duplicate", ago(14 * HOUR), {
		from: e.number,
	});
	// F left Triage before the period; H was done 60 days ago, in 48 hours.
	const f = await addIssue(p.id, {
		status: "todo",
		createdAt: ago(45 * DAY),
		updatedAt: ago(40 * DAY),
	});
	await log(f.id, "system", "created_from_report", ago(45 * DAY));
	await log(
		f.id,
		"user",
		"updated",
		ago(40 * DAY),
		statusChange("triage", "todo"),
	);
	const h = await addIssue(p.id, {
		status: "done",
		createdAt: ago(62 * DAY),
		updatedAt: ago(60 * DAY),
	});
	await log(
		h.id,
		"user",
		"updated",
		ago(60 * DAY),
		statusChange("todo", "done"),
	);
	// I came back twice in the period (once without a release), once before.
	const i = await addIssue(p.id, {
		status: "todo",
		createdAt: ago(70 * DAY),
		updatedAt: ago(5 * HOUR),
	});
	for (const [when, release] of [
		[ago(5 * HOUR), "2.0.0"],
		[ago(3 * DAY), null],
		[ago(40 * DAY), "1.0.0"],
	] as const)
		await log(i.id, "system", "regressed", when, {
			reportId: r1.id,
			release,
			...statusChange("done", "todo"),
		});

	// Duplicate suggestions: one made, one dismissed in the period.
	await db.insert(duplicateSuggestion).values([
		{
			issueId: a.id,
			suggestedIssueId: g.id,
			source: "ai",
			reason: "Same checkout error for Ada Lovelace",
			createdAt: ago(DAY),
		},
		{
			issueId: b.id,
			suggestedIssueId: g.id,
			source: "text",
			reason: "Same words",
			createdAt: ago(40 * DAY),
			dismissedAt: ago(2 * DAY),
		},
		{
			issueId: c.id,
			suggestedIssueId: g.id,
			source: "text",
			reason: "Same words",
			createdAt: ago(40 * DAY),
			dismissedAt: ago(35 * DAY),
		},
	]);

	// Conversations: r1 answered in 30 minutes and waiting again, r2 answered
	// in 90 minutes, r3 never answered, r4 answered before the period.
	const message = (
		reportId: string,
		authorType: "user" | "agent" | "reporter",
		createdAt: Date,
	) => ({
		reportId,
		authorType,
		authorId: authorType === "reporter" ? REPORTER.id : "user-1",
		authorName: authorType === "reporter" ? REPORTER.name : "Ada",
		body: "Private conversation text",
		createdAt,
	});
	await db
		.insert(reportMessage)
		.values([
			message(r1.id, "user", ago(30 * 60_000)),
			message(r1.id, "reporter", ago(20 * 60_000)),
			message(r2.id, "agent", new Date(r2.createdAt.getTime() + 1.5 * HOUR)),
			message(r3.id, "reporter", new Date(r3.createdAt.getTime() + HOUR)),
			message(r4.id, "user", new Date(r4.createdAt.getTime() + 10 * HOUR)),
		]);

	// Webhooks: one delivery gave up in the period.
	const endpoint = await createWebhookEndpoint(
		p.id,
		"https://hooks.example.com/a",
	);
	const other = await createWebhookEndpoint(
		sibling.id,
		"https://hooks.example.com/b",
	);
	const delivery = (
		endpointId: string,
		status: "pending" | "success" | "failed",
		createdAt: Date,
	) => ({ endpointId, event: "issue.created", payload: {}, status, createdAt });
	await db
		.insert(webhookDelivery)
		.values([
			delivery(endpoint.id, "failed", ago(DAY)),
			delivery(endpoint.id, "failed", ago(40 * DAY)),
			delivery(endpoint.id, "success", ago(HOUR)),
			delivery(endpoint.id, "pending", ago(HOUR)),
			delivery(other.id, "failed", ago(HOUR)),
		]);

	return { now, org, project: p, sibling, reports: { r1, r2, r3, r4, r5 } };
};

describe("get_stats", () => {
	it("aggregates one project over the last 30 days, for a read-only token", async () => {
		const { org, project: p, reports } = await seed();
		const { token } = await createApiToken(org.id, { canWrite: false });
		const result = stats(await call(token, "get_stats", { project: p.slug }));

		expect(result.untrustedUserContent).toBe(true);
		expect(result.period.days).toBe(30);
		const to = new Date(result.period.to);
		expect(result.period.from).toBe(
			new Date(
				Date.parse(`${utcDay(to)}T00:00:00.000Z`) - 29 * DAY,
			).toISOString(),
		);

		expect(result.reports.total).toBe(4);
		expect(result.reports.byType).toEqual({ bug: 2, feature: 2 });
		expect(result.reports.byDay).toHaveLength(30);
		expect(result.reports.byDay.at(-1).date).toBe(utcDay(to));
		const expectedDays = new Map<string, { bug: number; feature: number }>();
		for (const r of [reports.r1, reports.r2, reports.r3, reports.r5]) {
			const entry = expectedDays.get(utcDay(r.createdAt)) ?? {
				bug: 0,
				feature: 0,
			};
			entry[r.type] += 1;
			expectedDays.set(utcDay(r.createdAt), entry);
		}
		expect(
			result.reports.byDay.filter(
				(day: { bug: number; feature: number }) => day.bug + day.feature > 0,
			),
		).toEqual(
			[...expectedDays]
				.sort(([x], [y]) => x.localeCompare(y))
				.map(([date, counts]) => ({ date, ...counts })),
		);

		expect(result.triage.open).toBe(2);
		expect(result.triage.oldestAgeHours).toBeCloseTo(50, 1);
		// C 2 h, D 4 h, G 6 h; E (created in the backlog) and F (before) don't count.
		expect(result.triage.medianTimeToTriageHours).toBe(4);

		// G took 12 hours (in both windows), H 48 hours (90 days only).
		expect(result.resolution).toEqual({
			resolved30Days: 1,
			median30Days: 12,
			median90Days: 30,
		});

		expect(result.actors.byAction).toEqual([
			{ action: "created", user: 1, agent: 0, system: 0 },
			{ action: "created_from_report", user: 0, agent: 0, system: 5 },
			{ action: "marked_duplicate", user: 1, agent: 1, system: 0 },
			{ action: "merged_duplicate", user: 1, agent: 1, system: 0 },
			{ action: "regressed", user: 0, agent: 0, system: 2 },
			{ action: "updated", user: 2, agent: 1, system: 0 },
		]);
		expect(result.duplicates).toEqual({
			suggested: 1,
			merged: 2,
			dismissed: 1,
		});
		expect(result.regressions).toEqual({
			count: 2,
			byRelease: [
				{ release: "2.0.0", count: 1 },
				{ release: null, count: 1 },
			],
		});

		expect(result.sdkVersions).toEqual([
			{
				name: "@tattlehq/widget",
				version: "1.2.0",
				reports: 2,
				lastSeenAt: reports.r1.createdAt.toISOString(),
			},
			{
				name: "@tattlehq/widget",
				version: "1.1.0",
				reports: 1,
				lastSeenAt: reports.r3.createdAt.toISOString(),
			},
			{
				name: null,
				version: null,
				reports: 1,
				lastSeenAt: reports.r5.createdAt.toISOString(),
			},
		]);
		expect(result.releases).toEqual([
			{
				release: "2.0.0",
				reports: 2,
				lastSeenAt: reports.r1.createdAt.toISOString(),
			},
			{
				release: "1.9.0",
				reports: 1,
				lastSeenAt: reports.r3.createdAt.toISOString(),
			},
			// Cut to 100 characters.
			{
				release: "x".repeat(100),
				reports: 1,
				lastSeenAt: reports.r5.createdAt.toISOString(),
			},
		]);

		expect(result.conversations).toEqual({
			waiting: 2,
			medianFirstReplyHours: 1,
		});
		expect(result.webhooks).toEqual({ failed: 1 });
		expect(new Date(result.github.lastDeliveryAt).getTime()).toBeLessThan(
			to.getTime(),
		);
	});

	it("widens the period with days and leaves resolution on its own windows", async () => {
		const { org, project: p } = await seed();
		const { token } = await createApiToken(org.id, { canWrite: false });
		const result = stats(
			await call(token, "get_stats", { project: p.id, days: 60 }),
		);
		expect(result.period.days).toBe(60);
		expect(result.reports.byDay).toHaveLength(60);
		expect(result.reports.total).toBe(5);
		expect(
			result.sdkVersions.map((s: { version: string }) => s.version),
		).toContain("0.9.0");
		expect(result.regressions.count).toBe(3);
		expect(result.webhooks.failed).toBe(2);
		expect(result.duplicates.dismissed).toBe(2);
		// F (120 hours, 40 days ago) joins C, D and G: (4 + 6) / 2.
		expect(result.triage.medianTimeToTriageHours).toBe(5);
		expect(result.resolution).toEqual({
			resolved30Days: 1,
			median30Days: 12,
			median90Days: 30,
		});
	});

	it("accepts 1 to 365 days and refuses anything else", async () => {
		const { org, project: p } = await createWorkspace();
		const { token } = await createApiToken(org.id, { canWrite: false });
		for (const days of [1, 365]) {
			const result = stats(
				await call(token, "get_stats", { project: p.slug, days }),
			);
			expect(result.reports.byDay).toHaveLength(days);
		}
		for (const days of [0, 366, -1, 1.5, "30"]) {
			const message = await call(token, "get_stats", { project: p.slug, days });
			expect(message.result?.isError).toBe(true);
			expect(message.result?.content?.[0]?.text).toMatch(/days/);
		}
	});

	it("answers with zeros and nulls for an empty project, GitHub sync off", async () => {
		const { org, project: p } = await createWorkspace();
		const { token } = await createApiToken(org.id);
		const result = stats(await call(token, "get_stats", { project: p.slug }));
		expect(result).toMatchObject({
			reports: { total: 0, byType: { bug: 0, feature: 0 } },
			triage: { open: 0, oldestAgeHours: null, medianTimeToTriageHours: null },
			resolution: { resolved30Days: 0, median30Days: null, median90Days: null },
			actors: { byAction: [] },
			duplicates: { suggested: 0, merged: 0, dismissed: 0 },
			regressions: { count: 0, byRelease: [] },
			sdkVersions: [],
			releases: [],
			conversations: { waiting: 0, medianFirstReplyHours: null },
			webhooks: { failed: 0 },
			github: { lastDeliveryAt: null },
		});
	});

	it("shows no GitHub delivery once the sync is off", async () => {
		const { org, project: p } = await createWorkspace();
		await db
			.update(project)
			.set({ githubEnabled: false, githubLastDeliveryAt: new Date() })
			.where(eq(project.id, p.id));
		const { token } = await createApiToken(org.id, { canWrite: false });
		const result = stats(await call(token, "get_stats", { project: p.id }));
		expect(result.github.lastDeliveryAt).toBeNull();
	});

	it("refuses another organization's project", async () => {
		const { project: p } = await seed();
		const outsider = await createWorkspace();
		const { token } = await createApiToken(outsider.org.id);
		for (const ref of [p.id, p.slug]) {
			const message = await call(token, "get_stats", { project: ref });
			expect(message.result?.isError).toBe(true);
			expect(message.result?.content?.[0]?.text).toBe(
				`Project "${ref}" not found`,
			);
		}
	});

	it("contains no personal data", async () => {
		const { org, project: p } = await seed();
		const { token } = await createApiToken(org.id, { canWrite: false });
		const message = await call(token, "get_stats", {
			project: p.slug,
			days: 365,
		});
		const body = message.result?.content?.[0]?.text ?? "";
		expect(body.length).toBeGreaterThan(0);
		for (const personal of [
			REPORTER.id,
			REPORTER.email,
			REPORTER.name,
			"Ada",
			"user-1",
			"token-1",
			"Triage bot",
			MESSAGE,
			PAGE,
			"Private page",
			"Private conversation text",
			"Checkout fails",
			"hooks.example.com",
		])
			expect(body).not.toContain(personal);
	});
});
