import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "#/db";
import { type JsonObject, webhookDelivery, webhookEndpoint } from "#/db/schema";
import { DataLifecycle } from "#/server/DataLifecycle";
import { Ingest } from "#/server/Ingest";
import {
	DELIVERY_LOG_DAYS,
	PENDING_DELIVERY_HOURS,
	Webhooks,
} from "#/server/Webhooks";
import {
	createWebhookEndpoint,
	createWorkspace,
	reportPayload,
} from "./helpers/factories";
import { run, setupTestDatabase } from "./helpers/runtime";

// Deliveries are written straight to the table: nothing is sent anywhere.
// Endpoints are turned off, so the recovery sweep never picks them up.

setupTestDatabase();

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms);

/** What a JSON delivery of report.created holds: the reporter's words. */
const reportCopy = (email: string, reportId = crypto.randomUUID()) => ({
	id: crypto.randomUUID(),
	event: "report.created",
	data: {
		report: { id: reportId, message: "My card was charged twice" },
		reporter: { email, name: "Jo" },
	},
});

const endpointOf = async (projectId: string) => {
	const endpoint = await createWebhookEndpoint(
		projectId,
		"https://hooks.example.test/tattle",
	);
	await db
		.update(webhookEndpoint)
		.set({ active: false })
		.where(eq(webhookEndpoint.id, endpoint.id));
	return endpoint;
};

const insert = async (
	endpointId: string,
	rows: Array<{
		status: "pending" | "success" | "failed";
		payload: JsonObject;
		createdAt: Date;
	}>,
) =>
	db
		.insert(webhookDelivery)
		.values(
			rows.map((row) => ({ endpointId, event: "report.created", ...row })),
		)
		.returning();

const rowOf = async (id: string) =>
	(
		await db.select().from(webhookDelivery).where(eq(webhookDelivery.id, id))
	)[0];

const sweep = () => run(Webhooks.use((w) => w.sweepDeliveries));

describe("the webhook delivery sweep", () => {
	it("drops old copies of reports, gives up stale deliveries and trims the log", async () => {
		const { project: p } = await createWorkspace();
		const endpoint = await endpointOf(p.id);
		const [legacy, fresh, stale, old, recentDone] = await insert(endpoint.id, [
			// Finished before payloads were dropped on finishing.
			{
				status: "success",
				payload: reportCopy("jo@example.com"),
				createdAt: ago(2 * HOUR),
			},
			// Being sent right now: kept as is.
			{
				status: "pending",
				payload: reportCopy("sam@example.com"),
				createdAt: ago(60_000),
			},
			// Its endpoint was turned off a while ago: it will never be sent.
			{
				status: "pending",
				payload: reportCopy("kim@example.com"),
				createdAt: ago((PENDING_DELIVERY_HOURS + 1) * HOUR),
			},
			{
				status: "failed",
				payload: {},
				createdAt: ago((DELIVERY_LOG_DAYS + 1) * 24 * HOUR),
			},
			{ status: "success", payload: {}, createdAt: ago(24 * HOUR) },
		]);

		expect(await sweep()).toEqual({ cleared: 1, abandoned: 1, deleted: 1 });

		expect(await rowOf(legacy?.id ?? "")).toMatchObject({
			status: "success",
			payload: {},
		});
		expect((await rowOf(fresh?.id ?? ""))?.payload).toEqual(fresh?.payload);
		expect(await rowOf(stale?.id ?? "")).toMatchObject({
			status: "failed",
			payload: {},
			lastError: `Not sent within ${PENDING_DELIVERY_HOURS} hours`,
		});
		expect(await rowOf(old?.id ?? "")).toBeUndefined();
		expect(await rowOf(recentDone?.id ?? "")).toMatchObject({ payload: {} });

		// Nothing left to do: a second run changes nothing.
		expect(await sweep()).toEqual({ cleared: 0, abandoned: 0, deleted: 0 });
	});

	it("goes through more than one batch in a run", async () => {
		const { project: p } = await createWorkspace();
		const endpoint = await endpointOf(p.id);
		await db.execute(sql`
			insert into webhook_delivery (id, endpoint_id, event, payload, status, created_at)
			select gen_random_uuid()::text, ${endpoint.id}, 'report.created',
				jsonb_build_object('data', jsonb_build_object('reporter', jsonb_build_object('email', 'p' || n || '@example.com'))),
				'failed', now() - interval '1 day'
			from generate_series(1, 2500) as n`);

		expect(await sweep()).toMatchObject({ cleared: 2500 });
		const [left] = await db
			.select({ value: sql<number>`count(*)::int` })
			.from(webhookDelivery)
			.where(sql`${webhookDelivery.payload} <> '{}'::jsonb`);
		expect(left?.value).toBe(0);
	});
});

describe("erasing a reporter", () => {
	it("drops the deliveries still waiting with a copy of their reports, in their organization only", async () => {
		const { org, project: p } = await createWorkspace();
		const { project: other } = await createWorkspace();
		const mine = await endpointOf(p.id);
		const theirs = await endpointOf(other.id);
		const report = await run(
			Ingest.use((ingest) =>
				ingest.submit(
					reportPayload(p.publicKey, {
						reporter: { email: "jo@example.com", name: "Jo" },
					}),
					null,
				),
			),
		);
		const [byEmail, byReport, someoneElse] = await insert(mine.id, [
			{
				status: "pending",
				payload: reportCopy("Jo@Example.com"),
				createdAt: ago(60_000),
			},
			// A Discord message, say: no email, but the report's id in a link.
			{
				status: "pending",
				payload: {
					content: `New report https://tattle.example/r/${report.id}`,
				},
				createdAt: ago(60_000),
			},
			{
				status: "pending",
				payload: reportCopy("sam@example.com"),
				createdAt: ago(60_000),
			},
		]);
		const [elsewhere] = await insert(theirs.id, [
			{
				status: "pending",
				payload: reportCopy("jo@example.com"),
				createdAt: ago(60_000),
			},
		]);

		await run(
			DataLifecycle.use((d) => d.eraseReporter(org.id, "jo@example.com")),
		);

		for (const row of [byEmail, byReport]) {
			expect(await rowOf(row?.id ?? "")).toMatchObject({
				status: "failed",
				payload: {},
				lastError: "Not sent: the reporter's data was erased",
			});
		}
		expect(await rowOf(someoneElse?.id ?? "")).toMatchObject({
			status: "pending",
			payload: someoneElse?.payload,
		});
		expect(await rowOf(elsewhere?.id ?? "")).toMatchObject({
			status: "pending",
			payload: elsewhere?.payload,
		});
	});
});
