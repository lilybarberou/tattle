import { sql } from "drizzle-orm";
import { Effect, type Layer } from "effect";
import { afterAll, beforeEach } from "vitest";
import { db } from "#/db";
import { backgroundSettled } from "#/server/background";
import { type AppLayer, runtime } from "#/server/runtime";

type Services = Layer.Success<typeof AppLayer>;

/** Runs a program with the app's services; rejects on failure. */
export const run = <A, E>(program: Effect.Effect<A, E, Services>) =>
	runtime.runPromise(program);

/** Runs a program that must fail and returns its typed error. */
export const runFailure = <A, E>(program: Effect.Effect<A, E, Services>) =>
	runtime.runPromise(Effect.flip(program));

/** Empties every table of the test database (migrations stay applied). */
export const resetDatabase = async () => {
	const { rows } = await db.execute<{ tablename: string }>(
		sql`select tablename from pg_tables where schemaname = 'public'`,
	);
	if (rows.length === 0) return;
	// Emails, webhook deliveries and duplicate checks the previous test
	// started in the background: none may hold a lock during the truncate.
	await runtime.runPromise(backgroundSettled);
	const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
	await db.execute(
		sql.raw(`truncate table ${tables} restart identity cascade`),
	);
};

/**
 * For test files that touch the database: a clean database before each test,
 * and the runtime and connection pool closed after the file.
 */
export const setupTestDatabase = () => {
	beforeEach(resetDatabase);
	afterAll(async () => {
		await runtime.dispose();
		await db.$client.end();
	});
};

/** Polls `check` until it returns a value other than undefined/false. */
export const waitFor = async <T>(
	check: () => Promise<T | undefined | false> | T | undefined | false,
	{ timeout = 5_000, interval = 50 } = {},
): Promise<T> => {
	const started = Date.now();
	for (;;) {
		const value = await check();
		if (value !== undefined && value !== false) return value;
		if (Date.now() - started > timeout)
			throw new Error(`Condition not met within ${timeout} ms`);
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
};
