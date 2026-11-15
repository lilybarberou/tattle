import { count, isNull, sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { report } from "#/db/schema";
import { Database } from "#/server/Database";
import { DataLifecycle } from "#/server/DataLifecycle";
import { Storage } from "#/server/Storage";
import { createWorkspace } from "./helpers/factories";
import { setupTestDatabase, waitFor } from "./helpers/runtime";

setupTestDatabase();
afterEach(() => vi.unstubAllEnvs());

const DAY = 24 * 3600 * 1000;

/** `n` reports with logs, `ageDays` old, inserted in one statement. */
const insertReports = async (projectId: string, n: number, ageDays: number) => {
	const createdAt = new Date(Date.now() - ageDays * DAY);
	await db.insert(report).values(
		Array.from({ length: n }, (_, i) => ({
			projectId,
			type: "bug" as const,
			message: `Report ${i}`,
			pageUrl: "https://shop.example.com/",
			device: {},
			console: [{ level: "error" as const, message: "boom", timestamp: 1 }],
			network: [],
			createdAt,
		})),
	);
};

const withLogs = async () =>
	(
		await db
			.select({ value: count() })
			.from(report)
			.where(sql`jsonb_array_length(${report.console}) > 0`)
	)[0]?.value ?? 0;

/**
 * Builds DataLifecycle as the server does, with a test clock: the purge it
 * schedules runs when the clock passes 30 seconds.
 */
const startServer = () =>
	Effect.gen(function* () {
		yield* Layer.build(
			DataLifecycle.layer.pipe(
				Layer.provide(Layer.mergeAll(Database.layer, Storage.layer)),
			),
		);
		yield* TestClock.adjust("30 seconds");
		return yield* Effect.promise(() =>
			waitFor(async () => (await withLogs()) === 3, {
				timeout: 15_000,
			}),
		);
	}).pipe(Effect.scoped, Effect.provide(TestClock.layer()));

describe("the retention purge started with the server", () => {
	it("goes on past one batch until the backlog is gone", async () => {
		const { project: p } = await createWorkspace();
		await insertReports(p.id, 1_150, 40);
		await insertReports(p.id, 3, 5);
		vi.stubEnv("REPORT_RETENTION_DAYS", "30");

		await Effect.runPromise(startServer());

		// Only the recent ones keep their logs; every message stays.
		const left = await db
			.select({ message: report.message })
			.from(report)
			.where(sql`jsonb_array_length(${report.console}) > 0`);
		expect(left).toHaveLength(3);
		const total = await db.select({ value: count() }).from(report);
		expect(total[0]?.value).toBe(1_153);
		const keys = await db
			.select({ value: count() })
			.from(report)
			.where(isNull(report.screenshotKey));
		expect(keys[0]?.value).toBe(1_153);
	});

	it("does nothing when REPORT_RETENTION_DAYS is not a positive whole number", async () => {
		const { project: p } = await createWorkspace();
		await insertReports(p.id, 5, 400);
		for (const value of ["", "0", "-1", "2.5", "forever"]) {
			vi.stubEnv("REPORT_RETENTION_DAYS", value);
			await Effect.runPromise(
				Effect.gen(function* () {
					yield* Layer.build(
						DataLifecycle.layer.pipe(
							Layer.provide(Layer.mergeAll(Database.layer, Storage.layer)),
						),
					);
					yield* TestClock.adjust("7 hours");
					yield* Effect.promise(() => new Promise((r) => setTimeout(r, 100)));
				}).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
			);
			expect(await withLogs()).toBe(5);
		}
	});
});
