import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { issueVote, report } from "#/db/schema";
import { Ingest } from "#/server/Ingest";
import { Issues } from "#/server/Issues";
import {
	agentActor,
	createWorkspace,
	PNG_DATA_URL,
	reportPayload,
	userActor,
} from "./helpers/factories";
import { run, runFailure, setupTestDatabase, waitFor } from "./helpers/runtime";

setupTestDatabase();

const submit = (input: unknown) =>
	run(Ingest.use((ingest) => ingest.submit(input, null)));
const getIssue = (projectId: string, number: number) =>
	run(Issues.use((issues) => issues.get(projectId, number)));

describe("Issues.create", () => {
	it("creates a backlog issue with a trimmed title and logs it", async () => {
		const { project: p } = await createWorkspace();
		const created = await run(
			Issues.use((issues) =>
				issues.create(
					p.id,
					{ type: "feature", title: "  Dark mode  " },
					userActor,
				),
			),
		);
		expect(created).toMatchObject({
			number: 1,
			type: "feature",
			title: "Dark mode",
			status: "backlog",
			priority: 0,
			priorityLabel: "none",
		});
		const detail = await getIssue(p.id, 1);
		expect(detail.activity).toMatchObject([
			{ action: "created", actor: { type: "user", name: "Ada" } },
		]);
	});

	it("refuses an empty title", async () => {
		const { project: p } = await createWorkspace();
		const error = await runFailure(
			Issues.use((issues) =>
				issues.create(p.id, { type: "bug", title: "  " }, userActor),
			),
		);
		expect(error._tag).toBe("InvalidInput");
	});
});

describe("Issues.update", () => {
	const setup = async () => {
		const { project: p } = await createWorkspace();
		await run(
			Issues.use((issues) =>
				issues.create(p.id, { type: "bug", title: "Crash on save" }, userActor),
			),
		);
		return p;
	};
	const update = (
		projectId: string,
		patch: Parameters<Issues["Service"]["update"]>[2],
	) =>
		run(Issues.use((issues) => issues.update(projectId, 1, patch, agentActor)));
	const updateFailure = (
		projectId: string,
		number: number,
		patch: Parameters<Issues["Service"]["update"]>[2],
	) =>
		runFailure(
			Issues.use((issues) =>
				issues.update(projectId, number, patch, agentActor),
			),
		);

	it("applies the changes and records them in the activity log", async () => {
		const p = await setup();
		const updated = await update(p.id, {
			status: "todo",
			priority: 2,
			labels: [" UI ", "ui", "Checkout", ""],
			assignee: { type: "agent", id: "token-1", name: "Bot" },
		});
		expect(updated).toMatchObject({
			status: "todo",
			priority: 2,
			priorityLabel: "high",
			labels: ["ui", "checkout"],
			assignee: { type: "agent", id: "token-1", name: "Bot" },
		});

		const detail = await getIssue(p.id, 1);
		const last = detail.activity.at(-1);
		expect(last).toMatchObject({
			action: "updated",
			actor: { type: "agent", name: "Bot" },
			data: {
				changes: {
					status: { from: "backlog", to: "todo" },
					priority: { from: 0, to: 2 },
					labels: { from: [], to: ["ui", "checkout"] },
					assigneeName: { from: null, to: "Bot" },
				},
			},
		});
	});

	it("logs nothing when nothing changes", async () => {
		const p = await setup();
		await update(p.id, { title: "Crash on save", status: "backlog" });
		const detail = await getIssue(p.id, 1);
		expect(detail.activity.map((a) => a.action)).toEqual(["created"]);
	});

	it.each([
		["an empty title", { title: " " }],
		["the duplicate status", { status: "duplicate" as const }],
		["a priority out of range", { priority: 5 }],
		["a fractional priority", { priority: 1.5 }],
	])("refuses %s", async (_, patch) => {
		const p = await setup();
		expect((await updateFailure(p.id, 1, patch))._tag).toBe("InvalidInput");
	});

	it("answers NotFound for an unknown issue", async () => {
		const p = await setup();
		expect((await updateFailure(p.id, 99, { status: "todo" }))._tag).toBe(
			"NotFound",
		);
	});

	it("does not reach an issue of another project", async () => {
		await setup();
		const { project: other } = await createWorkspace();
		expect((await updateFailure(other.id, 1, { status: "todo" }))._tag).toBe(
			"NotFound",
		);
	});
});

describe("Issues.addComment", () => {
	it("adds a trimmed comment and refuses an empty one", async () => {
		const { project: p } = await createWorkspace();
		await submit(reportPayload(p.publicKey));
		const added = await run(
			Issues.use((issues) =>
				issues.addComment(p.id, 1, "  Looking into it  ", agentActor),
			),
		);
		expect(added).toMatchObject({
			body: "Looking into it",
			author: { type: "agent" },
		});
		expect((await getIssue(p.id, 1)).comments).toHaveLength(1);

		const error = await runFailure(
			Issues.use((issues) => issues.addComment(p.id, 1, "   ", agentActor)),
		);
		expect(error._tag).toBe("InvalidInput");
	});
});

describe("Issues.markDuplicate", () => {
	const twoReportedIssues = async () => {
		const { project: p } = await createWorkspace();
		const a = await submit(
			reportPayload(p.publicKey, { message: "Login fails" }),
		);
		const b = await submit(
			reportPayload(p.publicKey, { message: "Cannot log in" }),
		);
		return { p, a, b };
	};
	const markDuplicate = (projectId: string, number: number, of: number) =>
		Issues.use((issues) =>
			issues.markDuplicate(projectId, number, of, agentActor),
		);

	it("moves the reports to the original and recounts both issues", async () => {
		const { p, a, b } = await twoReportedIssues();
		const duplicate = await run(markDuplicate(p.id, 2, 1));
		expect(duplicate).toMatchObject({
			number: 2,
			status: "duplicate",
			reportCount: 0,
		});

		const original = await getIssue(p.id, 1);
		expect(original.issue.reportCount).toBe(2);
		expect(original.reports.map((r) => r.id).sort()).toEqual(
			[a.id, b.id].sort(),
		);
		expect(original.activity.at(-1)).toMatchObject({
			action: "merged_duplicate",
			data: { from: 2 },
		});

		const dup = await getIssue(p.id, 2);
		expect(dup.duplicateOf?.number).toBe(1);
		expect(dup.reports).toHaveLength(0);
		expect(dup.activity.at(-1)).toMatchObject({
			action: "marked_duplicate",
			data: { duplicateOf: 1 },
		});
	});

	it("refuses to mark an issue as a duplicate of itself", async () => {
		const { p } = await twoReportedIssues();
		expect((await runFailure(markDuplicate(p.id, 1, 1)))._tag).toBe(
			"InvalidInput",
		);
	});

	it("refuses to merge into an issue that is itself a duplicate", async () => {
		const { p } = await twoReportedIssues();
		await submit(reportPayload(p.publicKey, { message: "Login broken" }));
		await run(markDuplicate(p.id, 2, 1));
		expect((await runFailure(markDuplicate(p.id, 3, 2)))._tag).toBe(
			"InvalidInput",
		);
	});

	it("clears the link when the duplicate is reopened", async () => {
		const { p } = await twoReportedIssues();
		await run(markDuplicate(p.id, 2, 1));
		const reopened = await run(
			Issues.use((issues) =>
				issues.update(p.id, 2, { status: "todo" }, userActor),
			),
		);
		expect(reopened).toMatchObject({ status: "todo", duplicateOfId: null });
	});
});

describe("Issues.moveReport", () => {
	it("attaches the report to another issue and recounts both", async () => {
		const { project: p } = await createWorkspace();
		const a = await submit(
			reportPayload(p.publicKey, { message: "Slow search" }),
		);
		await submit(reportPayload(p.publicKey, { message: "Search is slow" }));

		const target = await run(
			Issues.use((issues) => issues.moveReport(p.id, a.id, 2, userActor)),
		);
		expect(target.reportCount).toBe(2);
		expect((await getIssue(p.id, 1)).issue.reportCount).toBe(0);
		expect((await getIssue(p.id, 2)).activity.at(-1)).toMatchObject({
			action: "report_attached",
			data: { reportId: a.id },
		});
	});

	it("answers NotFound for a report of another project", async () => {
		const { project: p } = await createWorkspace();
		const { project: other } = await createWorkspace();
		const foreign = await submit(reportPayload(other.publicKey));
		await submit(reportPayload(p.publicKey));
		const error = await runFailure(
			Issues.use((issues) => issues.moveReport(p.id, foreign.id, 1, userActor)),
		);
		expect(error._tag).toBe("NotFound");
	});
});

describe("Issues.search", () => {
	it("finds issues by words of their report messages", async () => {
		const { project: p } = await createWorkspace();
		await submit(
			reportPayload(p.publicKey, {
				message: "Page is blank\nThe invoice PDF never downloads",
			}),
		);
		await submit(
			reportPayload(p.publicKey, { message: "Typo on pricing page" }),
		);

		const found = await run(
			Issues.use((issues) => issues.search(p.id, "invoice download")),
		);
		expect(found.map((i) => i.number)).toEqual([1]);
	});

	it("ranks title matches first and ignores short words", async () => {
		const { project: p } = await createWorkspace();
		await submit(reportPayload(p.publicKey, { message: "Cart\nexport fails" }));
		await submit(
			reportPayload(p.publicKey, { message: "Export to CSV fails" }),
		);

		const found = await run(
			Issues.use((issues) => issues.search(p.id, "export")),
		);
		expect(found.map((i) => i.number)).toEqual([2, 1]);
		expect(
			await run(Issues.use((issues) => issues.search(p.id, "to a"))),
		).toEqual([]);
	});
});

describe("Issues.list", () => {
	it("returns each issue with its newest report and its error counts", async () => {
		const { project: p } = await createWorkspace();
		await submit(reportPayload(p.publicKey, { message: "Old report" }));
		await submit(
			reportPayload(p.publicKey, {
				type: "feature",
				message: "Newest report",
				screenshot: PNG_DATA_URL,
				reporter: {
					email: "jo@example.com",
					name: "Jo",
					traits: { plan: "pro" },
				},
				console: [
					{ level: "error", message: "a", timestamp: 1 },
					{ level: "error", message: "b", timestamp: 2 },
					{ level: "warn", message: "c", timestamp: 3 },
				],
				network: [
					{ method: "GET", url: "/a", status: 0, durationMs: 1, timestamp: 1 },
					{
						method: "GET",
						url: "/b",
						status: 404,
						durationMs: 1,
						timestamp: 2,
					},
					{
						method: "GET",
						url: "/c",
						status: 200,
						durationMs: 1,
						timestamp: 3,
					},
				],
			}),
		);
		// Both reports on issue #1.
		const [second] = await db
			.select()
			.from(report)
			.where(eq(report.message, "Newest report"));
		await run(
			Issues.use((issues) =>
				issues.moveReport(p.id, second?.id ?? "", 1, userActor),
			),
		);

		const items = await run(
			Issues.use((issues) => issues.list({ projectId: p.id })),
		);
		const first = items.find((i) => i.number === 1);
		expect(first?.reportCount).toBe(2);
		expect(first?.lastReport).toMatchObject({
			message: "Newest report",
			reporter: { email: "jo@example.com", name: "Jo" },
			hasScreenshot: true,
			consoleErrors: 2,
			failedRequests: 2,
		});
		expect(first?.lastReport?.reporter).not.toHaveProperty("traits");
		expect(items.find((i) => i.number === 2)?.lastReport).toBeNull();
	});

	it("filters by status and type", async () => {
		const { project: p } = await createWorkspace();
		await submit(reportPayload(p.publicKey, { type: "bug" }));
		await submit(reportPayload(p.publicKey, { type: "feature" }));
		await run(
			Issues.use((issues) =>
				issues.update(p.id, 1, { status: "todo" }, userActor),
			),
		);

		const list = (filter: Partial<Parameters<Issues["Service"]["list"]>[0]>) =>
			run(
				Issues.use((issues) => issues.list({ projectId: p.id, ...filter })),
			).then((items) => items.map((i) => i.number));
		expect(await list({ statuses: ["triage"] })).toEqual([2]);
		expect(await list({ type: "bug" })).toEqual([1]);
		expect(await list({ statuses: ["done"] })).toEqual([]);
	});
});

describe("shipping a feature request", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("tells everyone who asked for it once it is done", async () => {
		const { project: p } = await createWorkspace();
		const email = `asker-${randomUUID().slice(0, 8)}@example.com`;
		const voter = `voter-${randomUUID().slice(0, 8)}@example.com`;
		await submit(
			reportPayload(p.publicKey, {
				type: "feature",
				message: "Dark mode",
				reporter: { email, name: "Jo" },
			}),
		);
		const [row] = await db.select().from(report);
		await db
			.insert(issueVote)
			.values({ issueId: row?.issueId ?? "", voterKey: "v1", email: voter });
		const info = vi.spyOn(console, "info").mockImplementation(() => {});

		const done = await run(
			Issues.use((issues) =>
				issues.update(p.id, 1, { status: "done" }, userActor),
			),
		);
		expect(done.status).toBe("done");

		if (process.env.SMTP_HOST) {
			// With Mailpit (SMTP_HOST=localhost SMTP_PORT=1026), check the inbox.
			const api = process.env.MAILPIT_API ?? "http://localhost:8026/api/v1";
			for (const to of [email, voter]) {
				const message = await waitFor(async () => {
					const response = await fetch(
						`${api}/search?query=${encodeURIComponent(`to:${to}`)}`,
					);
					const body = (await response.json()) as {
						messages: Array<{ Subject: string }>;
					};
					return body.messages[0];
				});
				expect(message.Subject).toBe("Shipped: Dark mode");
			}
		} else {
			// Without SMTP the mailer logs what it would have sent.
			const sent = await waitFor(() => {
				const lines = info.mock.calls.map((c) => String(c[0]));
				const shipped = lines.filter((l) => l.includes('"Shipped: Dark mode"'));
				return shipped.length === 2 && shipped;
			});
			expect(sent.some((l) => l.includes(email))).toBe(true);
			expect(sent.some((l) => l.includes(voter))).toBe(true);
		}
	});

	it("sends nothing for a bug", async () => {
		const { project: p } = await createWorkspace();
		await submit(
			reportPayload(p.publicKey, { reporter: { email: "jo@example.com" } }),
		);
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		await run(
			Issues.use((issues) =>
				issues.update(p.id, 1, { status: "done" }, userActor),
			),
		);
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(info.mock.calls.flat().join("\n")).not.toContain("Shipped:");
	});
});
