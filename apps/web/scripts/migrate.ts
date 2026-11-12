// Runs before the server starts (see the Dockerfile): checks the environment,
// waits for Postgres, then applies the SQL migrations in ./drizzle.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { setupCodeLogLine } from "../src/lib/setup-code";

const problems: string[] = [];
const databaseUrl = process.env.DATABASE_URL;
const baseUrl = process.env.BETTER_AUTH_URL;
const secret = process.env.BETTER_AUTH_SECRET;

if (!databaseUrl)
	problems.push(
		"DATABASE_URL is missing (postgres://user:password@host:5432/db).",
	);
if (!baseUrl) {
	problems.push(
		"BETTER_AUTH_URL is missing: the public address of this server, e.g. https://tattle.example.org.",
	);
} else {
	try {
		new URL(baseUrl);
	} catch {
		problems.push(`BETTER_AUTH_URL is not a URL: "${baseUrl}".`);
	}
}
if (!secret || secret.length < 32) {
	problems.push(
		"BETTER_AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32",
	);
}
if (process.env.MIN_PASSWORD_LENGTH) {
	const min = Number(process.env.MIN_PASSWORD_LENGTH);
	if (!Number.isInteger(min) || min < 6 || min > 128) {
		problems.push(
			`MIN_PASSWORD_LENGTH must be a whole number from 6 to 128, not "${process.env.MIN_PASSWORD_LENGTH}".`,
		);
	}
}
if (process.env.STORAGE_DRIVER === "s3") {
	for (const name of [
		"S3_BUCKET",
		"S3_ACCESS_KEY_ID",
		"S3_SECRET_ACCESS_KEY",
	]) {
		if (!process.env[name])
			problems.push(`${name} is missing (STORAGE_DRIVER=s3).`);
	}
} else if (
	process.env.STORAGE_DRIVER &&
	process.env.STORAGE_DRIVER !== "local"
) {
	problems.push(
		`STORAGE_DRIVER must be "local" or "s3", not "${process.env.STORAGE_DRIVER}".`,
	);
}
if (process.env.REPORT_RETENTION_DAYS) {
	const days = Number(process.env.REPORT_RETENTION_DAYS);
	if (!Number.isInteger(days) || days < 1) {
		problems.push(
			`REPORT_RETENTION_DAYS must be a whole number of days, not "${process.env.REPORT_RETENTION_DAYS}".`,
		);
	}
}
if (process.env.TRIAGE_DIGEST_HOUR?.trim()) {
	const hour = Number(process.env.TRIAGE_DIGEST_HOUR);
	if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
		problems.push(
			`TRIAGE_DIGEST_HOUR must be an hour from 0 to 23 (UTC), not "${process.env.TRIAGE_DIGEST_HOUR}".`,
		);
	}
}
if (process.env.SMTP_HOST) {
	const port = Number(process.env.SMTP_PORT ?? 587);
	if (!Number.isInteger(port) || port <= 0)
		problems.push(
			`SMTP_PORT is not a port number: "${process.env.SMTP_PORT}".`,
		);
	if (!process.env.SMTP_FROM && !process.env.SMTP_USER) {
		problems.push(
			'SMTP_FROM is missing: the sender, e.g. "Tattle <tattle@example.org>".',
		);
	}
} else {
	console.log(
		"SMTP is not configured: invitations are links to send yourself, password reset is off and no notification is emailed.",
	);
}
if (problems.length > 0) {
	console.error(`Cannot start:\n- ${problems.join("\n- ")}`);
	process.exit(1);
}

const db = drizzle(databaseUrl as string);
const migrationsFolder = process.env.MIGRATIONS_DIR ?? "./drizzle";

for (let attempt = 1; ; attempt++) {
	try {
		await migrate(db, { migrationsFolder });
		console.log("Database is up to date.");
		break;
	} catch (error) {
		const code = (error as { code?: string }).code;
		const unreachable = [
			"ECONNREFUSED",
			"ENOTFOUND",
			"EAI_AGAIN",
			"57P03",
		].includes(code ?? "");
		if (!unreachable || attempt >= 30) {
			console.error("Migration failed:", error);
			process.exit(1);
		}
		console.log(`Waiting for the database (${attempt}/30)…`);
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
}
// A fresh server: say how to create the admin account.
const users = await db.$client.query('select count(*)::int as n from "user"');
if (users.rows[0]?.n === 0) console.log(setupCodeLogLine(baseUrl as string));
await db.$client.end();
