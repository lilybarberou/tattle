import { existsSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "#/db";
import { activity, issue, issueVote, project, report } from "#/db/schema";
import { DataLifecycle } from "#/server/DataLifecycle";
import { Ingest } from "#/server/Ingest";
import { Issues } from "#/server/Issues";
import {
	createProject,
	createWorkspace,
	PNG_DATA_URL,
	reportPayload,
	userActor,
} from "./helpers/factories";
import { run, runFailure, setupTestDatabase } from "./helpers/runtime";

setupTestDatabase();

const submit = (input: unknown) =>
	run(Ingest.use((ingest) => ingest.submit(input, null)));
const fileOf = (key: string | null) =>
	join(process.env.STORAGE_DIR ?? "", key ?? "");
const reportRow = async (id: string) =>
	(await db.select().from(report).where(eq(report.id, id)))[0];
const issueRow = async (projectId: string, number: number) =>
	(
		await db
			.select()
			.from(issue)
			.where(
				sql`${issue.projectId} = ${projectId} and ${issue.number} = ${number}`,
			)
	)[0];

const withScreenshot = (key: string, overrides = {}) =>
	reportPayload(key, { screenshot: PNG_DATA_URL, ...overrides });

describe("deleteReport", () => {
	it("removes the report and its screenshot, recounts and logs it", async () => {
		const { project: p } = await createWorkspace();
		const a = await submit(withScreenshot(p.publicKey));
		const b = await submit(reportPayload(p.publicKey));
		await run(
			Issues.use((issues) => issues.moveReport(p.id, b.id, 1, userActor)),
		);
		const key = (await reportRow(a.id))?.screenshotKey ?? null;
		expect(existsSync(fileOf(key))).toBe(true);

		await run(DataLifecycle.use((d) => d.deleteReport(p.id, a.id, userActor)));

		expect(await reportRow(a.id)).toBeUndefined();
		expect(existsSync(fileOf(key))).toBe(false);
		const after = await issueRow(p.id, 1);
		expect(after?.reportCount).toBe(1);
		const events = await db
			.select()
			.from(activity)
			.where(eq(activity.issueId, after?.id ?? ""));
		expect(events.map((e) => e.action)).toContain("report_deleted");
	});

	it("answers NotFound for a report of another project", async () => {
		const { project: p } = await createWorkspace();
		const { project: other } = await createWorkspace();
		const a = await submit(reportPayload(p.publicKey));
		const error = await runFailure(
			DataLifecycle.use((d) => d.deleteReport(other.id, a.id, userActor)),
		);
		expect(error._tag).toBe("NotFound");
		expect(await reportRow(a.id)).toBeDefined();
	});
});

describe("deleteIssue", () => {
	it("deletes the issue, its reports and files, and unlinks its duplicates", async () => {
		const { project: p } = await createWorkspace();
		const a = await submit(withScreenshot(p.publicKey));
		await submit(reportPayload(p.publicKey));
		await run(
			Issues.use((issues) => issues.markDuplicate(p.id, 2, 1, userActor)),
		);
		const key = (await reportRow(a.id))?.screenshotKey ?? null;

		await run(DataLifecycle.use((d) => d.deleteIssue(p.id, 1)));

		expect(await issueRow(p.id, 1)).toBeUndefined();
		expect(await db.select().from(report)).toEqual([]);
		expect(existsSync(fileOf(key))).toBe(false);
		expect(await issueRow(p.id, 2)).toMatchObject({
			status: "duplicate",
			duplicateOfId: null,
		});
	});

	it("answers NotFound for an unknown issue", async () => {
		const { project: p } = await createWorkspace();
		expect(
			(await runFailure(DataLifecycle.use((d) => d.deleteIssue(p.id, 9))))._tag,
		).toBe("NotFound");
	});
});

describe("deleteProject", () => {
	it("removes the project, its rows and its stored files", async () => {
		const { org, project: p } = await createWorkspace();
		const keep = await createProject(org.id);
		const a = await submit(withScreenshot(p.publicKey));
		const kept = await submit(withScreenshot(keep.publicKey));
		const key = (await reportRow(a.id))?.screenshotKey ?? null;
		const keptKey = (await reportRow(kept.id))?.screenshotKey ?? null;

		await run(DataLifecycle.use((d) => d.deleteProject(p.id)));

		expect(await db.select().from(project).where(eq(project.id, p.id))).toEqual(
			[],
		);
		expect(
			await db.select().from(issue).where(eq(issue.projectId, p.id)),
		).toEqual([]);
		expect(
			await db.select().from(report).where(eq(report.projectId, p.id)),
		).toEqual([]);
		expect(existsSync(fileOf(key))).toBe(false);
		expect(existsSync(join(process.env.STORAGE_DIR ?? "", p.id))).toBe(false);
		// The other project is untouched.
		expect(existsSync(fileOf(keptKey))).toBe(true);
		expect(await reportRow(kept.id)).toBeDefined();
	});
});

describe("reporters (GDPR)", () => {
	const setup = async () => {
		const { org, project: p } = await createWorkspace();
		// #1: only Jo reported it. #2: Jo and Sam. #3: Sam only, Jo voted.
		const jo = { email: "Jo@Example.com", id: "user-42", name: "Jo" };
		const sam = { email: "sam@example.com", name: "Sam" };
		const onlyJo = await submit(
			withScreenshot(p.publicKey, {
				reporter: jo,
				message: "Jo's private problem",
			}),
		);
		const shared = await submit(reportPayload(p.publicKey, { reporter: sam }));
		const joToo = await submit(reportPayload(p.publicKey, { reporter: jo }));
		await run(
			Issues.use((issues) =>
				issues.moveReport(p.id, joToo.id, shared.issueNumber, userActor),
			),
		);
		await submit(
			reportPayload(p.publicKey, { reporter: sam, type: "feature" }),
		);
		const third = await issueRow(p.id, 4);
		await db.insert(issueVote).values({
			issueId: third?.id ?? "",
			voterKey: "jo-cookie",
			email: "jo@example.com",
		});
		await db
			.update(issue)
			.set({ voteCount: 1 })
			.where(eq(issue.id, third?.id ?? ""));
		return { org, p, onlyJo, shared, joToo };
	};

	it("finds what is stored about a person", async () => {
		const { org, p } = await setup();
		expect(
			await run(
				DataLifecycle.use((d) => d.findReporter(org.id, "jo@example.com")),
			),
		).toEqual({
			reports: 2,
			votes: 1,
			projects: [p.name],
		});
	});

	it("exports a person's reports and votes", async () => {
		const { org, p } = await setup();
		const exported = (await run(
			DataLifecycle.use((d) => d.exportReporter(org.id, " jo@example.com ")),
		)) as {
			subject: string;
			reports: Array<{
				project: string;
				message: string;
				screenshot: string | null;
			}>;
			votes: Array<{ issue: string }>;
		};
		expect(exported.subject).toBe("jo@example.com");
		expect(exported.reports).toHaveLength(2);
		const withShot = exported.reports.find(
			(r) => r.message === "Jo's private problem",
		);
		expect(withShot?.project).toBe(p.name);
		expect(withShot?.screenshot).toMatch(
			/^http:\/\/localhost:3000\/api\/v1\/files\?key=/,
		);
		expect(exported.votes).toEqual([
			{ issue: "Checkout button does nothing", votedAt: expect.any(String) },
		]);
	});

	it("erases by email: reports, votes, and issues only that person reported", async () => {
		const { org, p, onlyJo, joToo } = await setup();
		const key = (await reportRow(onlyJo.id))?.screenshotKey ?? null;

		const result = await run(
			DataLifecycle.use((d) => d.eraseReporter(org.id, "JO@example.com")),
		);
		expect(result).toEqual({ reports: 2, issues: 1, votes: 1 });

		expect(await reportRow(onlyJo.id)).toBeUndefined();
		expect(await reportRow(joToo.id)).toBeUndefined();
		expect(existsSync(fileOf(key))).toBe(false);
		// #1 carried Jo's words and nobody else's: gone.
		expect(await issueRow(p.id, 1)).toBeUndefined();
		// #2 was also reported by Sam: kept, recounted.
		expect(await issueRow(p.id, 2)).toMatchObject({ reportCount: 1 });
		// #4: Jo's vote is gone.
		expect(await issueRow(p.id, 4)).toMatchObject({
			voteCount: 0,
			reportCount: 1,
		});
		expect(await db.select().from(issueVote)).toEqual([]);
	});

	it("erases by the app's user id", async () => {
		const { org, p } = await setup();
		const result = await run(
			DataLifecycle.use((d) => d.eraseReporter(org.id, "user-42")),
		);
		expect(result).toMatchObject({ reports: 2, issues: 1 });
		expect(await issueRow(p.id, 2)).toMatchObject({ reportCount: 1 });
	});

	it("keeps issues created by hand even when their reports are erased", async () => {
		const { project: p, org } = await createWorkspace();
		await run(
			Issues.use((issues) =>
				issues.create(p.id, { type: "bug", title: "Manual" }, userActor),
			),
		);
		const r = await submit(
			reportPayload(p.publicKey, { reporter: { email: "jo@example.com" } }),
		);
		await run(
			Issues.use((issues) => issues.moveReport(p.id, r.id, 1, userActor)),
		);
		await run(
			DataLifecycle.use((d) => d.eraseReporter(org.id, "jo@example.com")),
		);
		expect(await issueRow(p.id, 1)).toMatchObject({
			title: "Manual",
			reportCount: 0,
		});
	});

	it("does not touch other organizations", async () => {
		await setup();
		const { org: other } = await createWorkspace();
		expect(
			await run(
				DataLifecycle.use((d) => d.eraseReporter(other.id, "jo@example.com")),
			),
		).toEqual({
			reports: 0,
			issues: 0,
			votes: 0,
		});
		expect(await db.select().from(report)).toHaveLength(4);
	});

	it("does nothing for an empty query", async () => {
		const { org } = await setup();
		expect(
			await run(DataLifecycle.use((d) => d.eraseReporter(org.id, "  "))),
		).toEqual({
			reports: 0,
			issues: 0,
			votes: 0,
		});
	});
});

describe("purgeExpired", () => {
	it("drops screenshots and logs of old reports only, keeping the message", async () => {
		const { project: p } = await createWorkspace();
		const logs = {
			console: [{ level: "error" as const, message: "boom", timestamp: 1 }],
			network: [
				{ method: "GET", url: "/x", status: 500, durationMs: 1, timestamp: 1 },
			],
		};
		const old = await submit(
			withScreenshot(p.publicKey, { ...logs, message: "Old one" }),
		);
		const recent = await submit(withScreenshot(p.publicKey, logs));
		await db
			.update(report)
			.set({ createdAt: new Date(Date.now() - 40 * 24 * 3600 * 1000) })
			.where(eq(report.id, old.id));
		const oldKey = (await reportRow(old.id))?.screenshotKey ?? null;
		const recentKey = (await reportRow(recent.id))?.screenshotKey ?? null;

		expect(await run(DataLifecycle.use((d) => d.purgeExpired(30)))).toBe(1);

		expect(await reportRow(old.id)).toMatchObject({
			message: "Old one",
			screenshotKey: null,
			console: [],
			network: [],
		});
		expect(existsSync(fileOf(oldKey))).toBe(false);
		expect(await reportRow(recent.id)).toMatchObject({
			screenshotKey: recentKey,
			console: logs.console,
		});
		expect(existsSync(fileOf(recentKey))).toBe(true);
		// Nothing left to purge.
		expect(await run(DataLifecycle.use((d) => d.purgeExpired(30)))).toBe(0);
	});
});
