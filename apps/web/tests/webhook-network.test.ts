import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { webhookDelivery, webhookEndpoint } from "#/db/schema";
import { Database } from "#/server/Database";
import { Notifications } from "#/server/Notifications";
import { postPublic } from "#/server/public-request";
import { Storage } from "#/server/Storage";
import { PRIVATE_WEBHOOK_REFUSED, Webhooks } from "#/server/Webhooks";
import { createWebhookEndpoint, createWorkspace } from "./helpers/factories";
import { startReceiver } from "./helpers/http";
import { run, setupTestDatabase, waitFor } from "./helpers/runtime";

// Everything here stays on this machine: receivers listen on 127.0.0.1, and
// "localhost" resolves from the hosts file.

setupTestDatabase();

let closers: Array<() => Promise<void>> = [];
afterEach(async () => {
	await Promise.all(closers.map((close) => close()));
	closers = [];
	vi.unstubAllEnvs();
});

const receiver = async (status = 200) => {
	const started = await startReceiver(status);
	closers.push(started.close);
	return started;
};

const ping = (projectId: string, endpointId: string) =>
	run(Webhooks.use((w) => w.ping(projectId, endpointId)));

describe("connecting to a webhook endpoint", () => {
	it("refuses a name that resolves to this machine when the connection opens", async () => {
		const target = await receiver();
		const port = new URL(target.url).port;
		// Saved before the check existed, or a name that changed its answer.
		const { project: p } = await createWorkspace();
		const endpoint = await createWebhookEndpoint(
			p.id,
			`http://localhost:${port}/hook`,
		);
		expect(await ping(p.id, endpoint.id)).toEqual({
			ok: false,
			error: `Refused: ${PRIVATE_WEBHOOK_REFUSED}`,
		});
		expect(target.requests).toEqual([]);
	});

	it("reaches the same receiver once private addresses are allowed", async () => {
		vi.stubEnv("ALLOW_PRIVATE_URLS", "true");
		const target = await receiver(204);
		const port = new URL(target.url).port;
		const { project: p } = await createWorkspace();
		const endpoint = await createWebhookEndpoint(
			p.id,
			`http://localhost:${port}/hook`,
		);
		expect(await ping(p.id, endpoint.id)).toEqual({ ok: true, status: 204 });
		expect(target.requests).toHaveLength(1);
		expect(JSON.parse(target.requests[0]?.body ?? "{}")).toMatchObject({
			event: "ping",
			data: {},
		});
	});

	it("says only that it could not connect, never what answered", async () => {
		vi.stubEnv("ALLOW_PRIVATE_URLS", "true");
		const closed = createServer();
		await new Promise<void>((resolve) =>
			closed.listen(0, "127.0.0.1", resolve),
		);
		const { port } = closed.address() as AddressInfo;
		await new Promise<void>((resolve) => closed.close(() => resolve()));
		const { project: p } = await createWorkspace();
		const endpoint = await createWebhookEndpoint(
			p.id,
			`http://127.0.0.1:${port}/hook`,
		);
		expect(await ping(p.id, endpoint.id)).toEqual({
			ok: false,
			error: "Could not connect",
		});
	});

	it("answers for an unknown endpoint, or one of another project", async () => {
		const { project: p } = await createWorkspace();
		const { project: other } = await createWorkspace();
		const endpoint = await createWebhookEndpoint(
			other.id,
			"https://hooks.example.invalid/x",
		);
		expect(await ping(p.id, endpoint.id)).toEqual({
			ok: false,
			error: "Endpoint not found",
		});
	});
});

describe("postPublic", () => {
	it("gives up when the signal times out", async () => {
		const silent = createServer(() => {});
		await new Promise<void>((resolve) =>
			silent.listen(0, "127.0.0.1", resolve),
		);
		closers.push(
			() =>
				new Promise<void>((resolve) => {
					silent.closeAllConnections();
					silent.close(() => resolve());
				}),
		);
		const { port } = silent.address() as AddressInfo;
		const error = await postPublic(`http://127.0.0.1:${port}/`, {
			headers: {},
			body: "{}",
			signal: AbortSignal.timeout(100),
			publicOnly: false,
		}).catch((e: unknown) => e);
		expect((error as Error).name).toBe("TimeoutError");
	});

	it("sends the length of the body and never follows a redirect", async () => {
		const target = await startReceiver(302, {
			location: "http://127.0.0.1:1/",
		});
		closers.push(target.close);
		const status = await postPublic(target.url, {
			headers: { "content-type": "application/json" },
			body: '{"é":1}',
			signal: AbortSignal.timeout(5_000),
			publicOnly: false,
		});
		expect(status).toBe(302);
		expect(target.requests).toHaveLength(1);
		// Bytes, not characters: "é" takes two.
		expect(target.requests[0]?.headers["content-length"]).toBe("8");
	});

	it("refuses localhost with publicOnly, before sending anything", async () => {
		const target = await receiver();
		const port = new URL(target.url).port;
		const error = await postPublic(`http://localhost:${port}/hook`, {
			headers: {},
			body: "{}",
			signal: AbortSignal.timeout(5_000),
			publicOnly: true,
		}).catch((e: unknown) => e);
		expect((error as NodeJS.ErrnoException).code).toBe("EPRIVATEADDRESS");
		expect(target.requests).toEqual([]);
	});
});

describe("deliveries left pending by a restart", () => {
	const startWebhooks = () =>
		Layer.build(
			Webhooks.layer.pipe(
				Layer.provide(
					Layer.mergeAll(
						Database.layer,
						Storage.layer,
						Notifications.layer.pipe(
							Layer.provide(Layer.mergeAll(Database.layer, Storage.layer)),
						),
					),
				),
			),
		);

	const pending = async (endpointId: string, ageMs: number) => {
		const [row] = await db
			.insert(webhookDelivery)
			.values({
				endpointId,
				event: "report.created",
				payload: { event: "report.created", data: { message: "Hello" } },
				createdAt: new Date(Date.now() - ageMs),
			})
			.returning();
		return row?.id as string;
	};

	it("are sent again by the sweep, then lose their copy of the report", async () => {
		vi.stubEnv("ALLOW_PRIVATE_URLS", "true");
		const target = await receiver();
		const { project: p } = await createWorkspace();
		const endpoint = await createWebhookEndpoint(p.id, target.url);
		const inactive = await createWebhookEndpoint(p.id, target.url);
		await db
			.update(webhookEndpoint)
			.set({ active: false })
			.where(eq(webhookEndpoint.id, inactive.id));
		const old = await pending(endpoint.id, 5 * 60_000);
		const recent = await pending(endpoint.id, 10_000);
		const off = await pending(inactive.id, 5 * 60_000);

		await Effect.runPromise(
			Effect.gen(function* () {
				yield* startWebhooks();
				yield* TestClock.adjust("10 seconds");
				yield* Effect.promise(() =>
					waitFor(async () => {
						const [row] = await db
							.select()
							.from(webhookDelivery)
							.where(eq(webhookDelivery.id, old));
						return row?.status === "success" || undefined;
					}),
				);
			}).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
		);

		expect(target.requests).toHaveLength(1);
		expect(JSON.parse(target.requests[0]?.body ?? "{}")).toMatchObject({
			data: { message: "Hello" },
		});
		const rows = await db.select().from(webhookDelivery);
		const byId = new Map(rows.map((r) => [r.id, r]));
		expect(byId.get(old)).toMatchObject({
			status: "success",
			payload: {},
			attempts: 1,
			responseStatus: 200,
		});
		expect(byId.get(recent)?.status).toBe("pending");
		expect(byId.get(off)?.status).toBe("pending");
	});
});
