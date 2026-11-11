import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "#/db";
import { activity, issue, report, webhookDelivery } from "#/db/schema";
import { Ingest } from "#/server/Ingest";
import {
	createWebhookEndpoint,
	createWorkspace,
	PNG_DATA_URL,
	reportPayload,
} from "./helpers/factories";
import { run, runFailure, setupTestDatabase, waitFor } from "./helpers/runtime";

setupTestDatabase();

const submit = (input: unknown, origin: string | null = null) =>
	run(Ingest.use((ingest) => ingest.submit(input, origin)));
const submitFailure = (input: unknown, origin: string | null = null) =>
	runFailure(Ingest.use((ingest) => ingest.submit(input, origin)));

describe("Ingest.submit", () => {
	it("saves the report and opens a triage issue titled after its first line", async () => {
		const { project: p } = await createWorkspace();
		const result = await submit(
			reportPayload(p.publicKey, {
				message: "  Checkout button does nothing\nSteps: click it.  ",
				reporter: { email: "jo@example.com", name: "Jo" },
			}),
			"https://shop.example.com",
		);

		expect(result.issueNumber).toBe(1);
		const [saved] = await db
			.select()
			.from(report)
			.where(eq(report.id, result.id));
		expect(saved).toMatchObject({
			projectId: p.id,
			type: "bug",
			message: "Checkout button does nothing\nSteps: click it.",
			origin: "https://shop.example.com",
			reporter: { email: "jo@example.com", name: "Jo" },
			screenshotKey: null,
		});
		const [created] = await db
			.select()
			.from(issue)
			.where(eq(issue.id, saved?.issueId ?? ""));
		expect(created).toMatchObject({
			number: 1,
			status: "triage",
			type: "bug",
			title: "Checkout button does nothing",
			reportCount: 1,
		});
		const events = await db
			.select()
			.from(activity)
			.where(eq(activity.issueId, created?.id ?? ""));
		expect(events.map((e) => e.action)).toEqual(["created_from_report"]);
	});

	it("numbers issues per project", async () => {
		const { project: p } = await createWorkspace();
		const first = await submit(reportPayload(p.publicKey));
		const second = await submit(reportPayload(p.publicKey));
		expect([first.issueNumber, second.issueNumber]).toEqual([1, 2]);
	});

	it("shortens long titles", async () => {
		const { project: p } = await createWorkspace();
		await submit(reportPayload(p.publicKey, { message: "x".repeat(200) }));
		const [created] = await db.select().from(issue);
		expect(created?.title).toHaveLength(88);
		expect(created?.title.endsWith("…")).toBe(true);
	});

	it("stores the screenshot under the project folder", async () => {
		const { project: p } = await createWorkspace();
		const result = await submit(
			reportPayload(p.publicKey, { screenshot: PNG_DATA_URL }),
		);
		const [saved] = await db
			.select()
			.from(report)
			.where(eq(report.id, result.id));
		expect(saved?.screenshotKey).toBe(`${p.id}/reports/${result.id}.png`);

		const file = join(
			process.env.STORAGE_DIR ?? "",
			saved?.screenshotKey ?? "",
		);
		expect(existsSync(file)).toBe(true);
		const expected = Buffer.from(PNG_DATA_URL.split(",")[1] ?? "", "base64");
		expect(readFileSync(file).equals(expected)).toBe(true);
	});

	it("rejects a screenshot that is not an image data URL", async () => {
		const { project: p } = await createWorkspace();
		const error = await submitFailure(
			reportPayload(p.publicKey, {
				screenshot: "data:text/html;base64,PGgxPg==",
			}),
		);
		expect(error._tag).toBe("InvalidInput");
		expect(await db.select().from(report)).toHaveLength(0);
	});

	it.each([
		["an empty message", { message: "" }],
		["an unknown type", { type: "question" }],
		["a missing device", { device: undefined }],
		[
			"too many console entries",
			{
				console: Array.from({ length: 501 }, () => ({
					level: "log",
					message: "x",
					timestamp: 0,
				})),
			},
		],
	])("rejects %s as invalid input", async (_, overrides) => {
		const { project: p } = await createWorkspace();
		const error = await submitFailure({
			...reportPayload(p.publicKey),
			...overrides,
		});
		expect(error._tag).toBe("InvalidInput");
	});

	it("rejects a payload that is not an object", async () => {
		expect((await submitFailure("hello"))._tag).toBe("InvalidInput");
	});

	it("answers NotFound for an unknown project key", async () => {
		const error = await submitFailure(reportPayload("pk_does_not_exist"));
		expect(error._tag).toBe("NotFound");
	});

	it("enforces the project's allowed origins", async () => {
		const { project: p } = await createWorkspace({
			allowedOrigins: ["https://shop.example.com"],
		});
		const payload = reportPayload(p.publicKey);

		expect(
			(await submitFailure(payload, "https://evil.example.com"))._tag,
		).toBe("InvalidInput");
		expect((await submitFailure(payload, null))._tag).toBe("InvalidInput");
		await expect(
			submit(payload, "https://shop.example.com"),
		).resolves.toMatchObject({
			issueNumber: 1,
		});
	});

	it("accepts any origin when allowed origins is a wildcard", async () => {
		const { project: p } = await createWorkspace({ allowedOrigins: ["*"] });
		await expect(
			submit(reportPayload(p.publicKey), "https://anywhere.example.com"),
		).resolves.toBeDefined();
	});

	it("queues report.created and issue.created webhooks", async () => {
		const { project: p } = await createWorkspace();
		// Nothing listens on port 9: deliveries fail and stay queued for retries.
		const endpoint = await createWebhookEndpoint(
			p.id,
			"http://127.0.0.1:9/hook",
		);
		const result = await submit(
			reportPayload(p.publicKey, {
				console: [{ level: "error", message: "boom", timestamp: 1 }],
				network: [
					{
						method: "POST",
						url: "/api/pay",
						status: 500,
						durationMs: 30,
						timestamp: 2,
					},
				],
			}),
		);

		const deliveries = await waitFor(async () => {
			const rows = await db
				.select()
				.from(webhookDelivery)
				.where(eq(webhookDelivery.endpointId, endpoint.id));
			return rows.length === 2 && rows;
		});
		const byEvent = Object.fromEntries(
			deliveries.map((d) => [d.event, d.payload]),
		);
		expect(Object.keys(byEvent).sort()).toEqual([
			"issue.created",
			"report.created",
		]);
		expect(byEvent["report.created"]).toMatchObject({
			event: "report.created",
			project: { id: p.id },
			data: {
				report: {
					id: result.id,
					consoleErrors: 1,
					failedRequests: 1,
					hasScreenshot: false,
				},
				issue: { number: 1, status: "triage" },
			},
		});
	});
});

describe("Ingest.allowedOrigins", () => {
	it("returns the origins of a known key and null otherwise", async () => {
		const { project: p } = await createWorkspace({
			allowedOrigins: ["https://shop.example.com"],
		});
		expect(await run(Ingest.use((i) => i.allowedOrigins(p.publicKey)))).toEqual(
			["https://shop.example.com"],
		);
		expect(
			await run(Ingest.use((i) => i.allowedOrigins("pk_nope"))),
		).toBeNull();
	});
});
