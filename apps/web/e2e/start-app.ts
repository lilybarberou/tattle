/**
 * Started by Playwright (webServer): recreates the e2e database, applies the
 * migrations, then runs the production build (.output, from `vite build`)
 * with the environment of e2e/config.ts only. Nothing is read from a .env
 * file or inherited from the shell, apart from PATH and HOME.
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { appEnv, assertEverythingLocal, DATABASE_URL } from "./config.ts";

assertEverythingLocal();

const server = fileURLToPath(
	new URL("../.output/server/index.mjs", import.meta.url),
);
if (!existsSync(server)) {
	console.error(
		"No production build in apps/web/.output: run `pnpm test:e2e`, which builds it first.",
	);
	process.exit(1);
}

// A fresh database for every run: drop it and create it again.
const name = new URL(DATABASE_URL).pathname.slice(1);
const adminUrl = new URL(DATABASE_URL);
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.toString() });
for (let attempt = 0; ; attempt++) {
	try {
		await admin.connect();
		break;
	} catch (error) {
		if (attempt > 30) {
			console.error(
				"Postgres for e2e is not up: docker compose -f e2e/docker-compose.e2e.yml up -d --wait",
			);
			throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}
await admin.query(`drop database if exists "${name}" with (force)`);
await admin.query(`create database "${name}"`);
await admin.end();

const db = drizzle(DATABASE_URL);
await migrate(db, {
	migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
});
await db.$client.end();

rmSync(appEnv.STORAGE_DIR, { recursive: true, force: true });

const child = spawn(process.execPath, [server], {
	env: {
		PATH: process.env.PATH ?? "",
		HOME: process.env.HOME ?? "",
		...appEnv,
	},
	stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
	process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
