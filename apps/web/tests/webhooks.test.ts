import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { webhookDelivery, webhookEndpoint } from "#/db/schema";
import { Ingest } from "#/server/Ingest";
import { Issues } from "#/server/Issues";
import { signPayload, Webhooks } from "#/server/Webhooks";
import {
	createWebhookEndpoint,
	createWorkspace,
	reportPayload,
	userActor,
} from "./helpers/factories";
import { startReceiver } from "./helpers/http";
import { run, runFailure, setupTestDatabase, waitFor } from "./helpers/runtime";

setupTestDatabase();

let receiver: Awaited<ReturnType<typeof startReceiver>>;
// The test receivers listen on 127.0.0.1.
beforeEach(() => {
	vi.stubEnv("ALLOW_PRIVATE_URLS", "true");
});
afterEach(async () => {
	await receiver?.close();
	vi.unstubAllEnvs();
});

const submit = (projectKey: string) =>
	run(Ingest.use((ingest) => ingest.submit(reportPayload(projectKey), null)));

const deliveriesOf = (endpointId: string) =>
	db
		.select()
		.from(webhookDelivery)
		.where(eq(webhookDelivery.endpointId, endpointId));

describe("signPayload", () => {
	it("is the hex HMAC-SHA256 of '<t>.<body>'", () => {
		const expected = createHmac("sha256", "s3cret")
			.update('123.{"a":1}')
			.digest("hex");
		expect(signPayload("s3cret", 123, '{"a":1}')).toBe(expected);
	});
});

describe("JSON endpoints", () => {
	it("receive signed deliveries that are recorded as successful", async () => {
		receiver = await startReceiver();
		const { project: p } = await createWorkspace();
		const endpoint = await createWebhookEndpoint(p.id, receiver.url, {
			secret: "whsec_abc",
			events: ["report.created"],
		});
		await submit(p.publicKey);

		const [request] = await waitFor(
			() => receiver.requests.length === 1 && receiver.requests,
		);
		const signature = String(request?.headers["x-tattle-signature"]);
		const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(signature);
		expect(match).not.toBeNull();
		const [, t, v1] = match as RegExpExecArray;
		expect(Math.abs(Date.now() / 1000 - Number(t))).toBeLessThan(60);
		expect(v1).toBe(
			createHmac("sha256", "whsec_abc")
				.update(`${t}.${request?.body}`)
				.digest("hex"),
		);
		expect(request?.headers["x-tattle-event"]).toBe("report.created");
		expect(request?.headers["content-type"]).toBe("application/json");

		const body = JSON.parse(request?.body ?? "{}");
		expect(body).toMatchObject({
			event: "report.created",
			project: { id: p.id, slug: p.slug, name: p.name },
			data: { issue: { number: 1 } },
		});
		expect(request?.headers["x-tattle-delivery"]).toBe(body.id);

		const [delivery] = await waitFor(async () => {
			const rows = await deliveriesOf(endpoint.id);
			return rows[0]?.status === "success" && rows;
		});
		expect(delivery).toMatchObject({
			id: body.id,
			attempts: 1,
			responseStatus: 200,
			lastError: null,
		});
		expect(delivery?.deliveredAt).toBeInstanceOf(Date);
	});

	it("only get the events they subscribed to", async () => {
		receiver = await startReceiver();
		const { project: p } = await createWorkspace();
		const endpoint = await createWebhookEndpoint(p.id, receiver.url, {
			events: ["comment.created"],
		});
		await submit(p.publicKey);
		await run(
			Issues.use((issues) => issues.addComment(p.id, 1, "On it", userActor)),
		);

		await waitFor(() => receiver.requests.length === 1);
		const rows = await deliveriesOf(endpoint.id);
		expect(rows.map((r) => r.event)).toEqual(["comment.created"]);
	});

	it("are skipped when inactive", async () => {
		receiver = await startReceiver();
		const { project: p } = await createWorkspace();
		const endpoint = await createWebhookEndpoint(p.id, receiver.url);
		await db
			.update(webhookEndpoint)
			.set({ active: false })
			.where(eq(webhookEndpoint.id, endpoint.id));
		await submit(p.publicKey);
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(await deliveriesOf(endpoint.id)).toEqual([]);
		expect(receiver.requests).toEqual([]);
	});
});

describe("chat endpoints", () => {
	it("Discord receives an embed without a signature", async () => {
		receiver = await startReceiver(204);
		const { project: p } = await createWorkspace();
		const endpoint = await createWebhookEndpoint(p.id, receiver.url, {
			format: "discord",
		});
		await submit(p.publicKey);

		// issue.created from the widget is skipped; only report.created is sent.
		const [request] = await waitFor(
			() => receiver.requests.length === 1 && receiver.requests,
		);
		expect(request?.headers["x-tattle-signature"]).toBeUndefined();
		const body = JSON.parse(request?.body ?? "{}");
		expect(body.username).toBe("Tattle");
		expect(body.embeds[0].title).toBe("Bug #1: Checkout button does nothing");
		await waitFor(
			async () => (await deliveriesOf(endpoint.id))[0]?.status === "success",
		);
	});

	it("Slack receives a text message, and label-only updates send nothing", async () => {
		receiver = await startReceiver();
		const { project: p } = await createWorkspace();
		const endpoint = await createWebhookEndpoint(p.id, receiver.url, {
			format: "slack",
		});
		await submit(p.publicKey);
		await waitFor(() => receiver.requests.length === 1);

		await run(
			Issues.use((issues) =>
				issues.update(p.id, 1, { labels: ["ui"] }, userActor),
			),
		);
		await run(
			Issues.use((issues) =>
				issues.update(p.id, 1, { status: "todo" }, userActor),
			),
		);

		const requests = await waitFor(
			() => receiver.requests.length === 2 && receiver.requests,
		);
		const texts = requests.map((r) => JSON.parse(r.body).text as string);
		expect(texts[0]).toContain("|Bug #1: Checkout button does nothing>");
		expect(texts[1]).toContain("Triage → *Todo*");
		expect(requests.every((r) => !r.headers["x-tattle-signature"])).toBe(true);
		// Only two deliveries were queued: the label change produced none.
		expect(
			(await deliveriesOf(endpoint.id)).map((d) => d.event).sort(),
		).toEqual(["issue.updated", "report.created"]);
	});
});

describe("ping", () => {
	it("reports the endpoint's answer", async () => {
		receiver = await startReceiver();
		const { project: p } = await createWorkspace();
		const ok = await createWebhookEndpoint(p.id, receiver.url);
		expect(await run(Webhooks.use((w) => w.ping(ok.id)))).toEqual({
			ok: true,
			status: 200,
		});
		expect(JSON.parse(receiver.requests[0]?.body ?? "{}").event).toBe("ping");

		const failing = await startReceiver(500);
		const bad = await createWebhookEndpoint(p.id, failing.url);
		expect(await run(Webhooks.use((w) => w.ping(bad.id)))).toMatchObject({
			ok: false,
			status: 500,
		});
		await failing.close();

		expect(await run(Webhooks.use((w) => w.ping("missing")))).toEqual({
			ok: false,
			error: "Endpoint not found",
		});
	});
});

describe("private addresses", () => {
	const create = (projectId: string, url: string) =>
		run(
			Webhooks.use((w) =>
				w.create(projectId, { url, events: [], format: "json" }),
			),
		);
	const createFailure = (projectId: string, url: string) =>
		runFailure(
			Webhooks.use((w) =>
				w.create(projectId, { url, events: [], format: "slack" }),
			),
		);

	it("refuses endpoints on this machine or a private network when saved", async () => {
		vi.stubEnv("ALLOW_PRIVATE_URLS", "");
		const { project: p } = await createWorkspace();
		for (const url of [
			"http://localhost:8080/hook",
			"http://127.0.0.1:9/hook",
			"http://169.254.169.254/latest/meta-data",
			"http://[::ffff:10.0.0.1]/hook",
			"http://192.168.1.20/hook",
		]) {
			const error = await createFailure(p.id, url);
			expect(error, url).toMatchObject({ _tag: "InvalidInput" });
			expect(error.message).toContain("ALLOW_PRIVATE_URLS=true");
		}
		expect(await createFailure(p.id, "ftp://203.0.113.10/x")).toMatchObject({
			_tag: "InvalidInput",
		});
		const saved = await create(p.id, "https://203.0.113.10/hook");
		const [row] = await db
			.select()
			.from(webhookEndpoint)
			.where(eq(webhookEndpoint.id, saved.id));
		expect(row).toMatchObject({ url: "https://203.0.113.10/hook" });
		expect(row?.secret).toMatch(/^whsec_/);
	});

	it("accepts them with ALLOW_PRIVATE_URLS=true, or its old name", async () => {
		const { project: p } = await createWorkspace();
		await create(p.id, "http://localhost:8080/hook");
		vi.stubEnv("ALLOW_PRIVATE_URLS", "");
		vi.stubEnv("AI_ALLOW_PRIVATE_URLS", "true");
		await create(p.id, "http://192.168.1.20/hook");
	});

	it("checks again before each delivery, and marks a refused one failed without retrying", async () => {
		receiver = await startReceiver();
		const { project: p } = await createWorkspace();
		const endpoint = await create(p.id, receiver.url);
		vi.stubEnv("ALLOW_PRIVATE_URLS", "");
		await submit(p.publicKey);
		const deliveries = await waitFor(async () => {
			const rows = await deliveriesOf(endpoint.id);
			return (
				rows.length === 2 && rows.every((r) => r.status === "failed") && rows
			);
		});
		for (const delivery of deliveries) {
			expect(delivery.attempts).toBe(1);
			expect(delivery.lastError).toContain("Refused");
			expect(delivery.lastError).toContain("ALLOW_PRIVATE_URLS=true");
		}
		expect(await run(Webhooks.use((w) => w.ping(endpoint.id)))).toMatchObject({
			ok: false,
			error: expect.stringContaining("Refused"),
		});
		expect(receiver.requests).toEqual([]);
	});

	it("never follow redirects", async () => {
		const target = await startReceiver();
		receiver = await startReceiver(302, { location: target.url });
		const { project: p } = await createWorkspace();
		const endpoint = await createWebhookEndpoint(p.id, receiver.url, {
			events: ["report.created"],
		});
		await submit(p.publicKey);
		const [delivery] = await waitFor(async () => {
			const rows = await deliveriesOf(endpoint.id);
			return rows[0]?.status === "failed" && rows;
		});
		expect(delivery).toMatchObject({
			responseStatus: 302,
			lastError: "HTTP 302: redirects are not followed",
		});
		expect(receiver.requests.length).toBeGreaterThan(0);
		expect(target.requests).toEqual([]);
		await target.close();
	});
});
