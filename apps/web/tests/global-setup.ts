import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { testDatabaseName, testDatabaseUrl } from "./database-url";

/** Creates the test database if it is missing, then applies the migrations. */
export default async function setup() {
	const adminUrl = new URL(testDatabaseUrl);
	adminUrl.pathname = "/postgres";
	const admin = new pg.Client({ connectionString: adminUrl.toString() });
	await admin.connect();
	try {
		const existing = await admin.query(
			"select 1 from pg_database where datname = $1",
			[testDatabaseName],
		);
		if (existing.rowCount === 0) {
			await admin.query(`create database "${testDatabaseName}"`);
		}
	} finally {
		await admin.end();
	}

	const db = drizzle(testDatabaseUrl);
	try {
		await migrate(db, {
			migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
		});
	} finally {
		await db.$client.end();
	}
}
