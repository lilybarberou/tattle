/**
 * Where everything the end-to-end suite talks to lives. All of it runs on
 * this machine: the app (a production build), a throwaway Postgres and a
 * Mailpit from e2e/docker-compose.e2e.yml, and a fixtures server that plays
 * the customer's website (it embeds the widget), the webhook receiver and
 * any other outside service. Nothing here may point anywhere else:
 * `assertEverythingLocal` refuses to start otherwise.
 */
import { fileURLToPath } from "node:url";

export const APP_PORT = 3100;
export const FIXTURES_PORT = 3101;

/** The dashboard and API. */
export const APP_URL = `http://localhost:${APP_PORT}`;
/**
 * The customer's website. Another origin than the app (127.0.0.1 is not
 * localhost), as in real life: the widget's requests are cross-origin.
 */
export const SITE_URL = `http://127.0.0.1:${FIXTURES_PORT}`;
/** Webhook deliveries land here (see e2e/fixtures-server.ts). */
export const RECEIVER_URL = `http://127.0.0.1:${FIXTURES_PORT}/hooks`;

export const DATABASE_URL =
	"postgres://tattle:tattle@127.0.0.1:54329/tattle_e2e";
export const MAILPIT_URL = "http://127.0.0.1:18025";

/** Fixed, so the first account can be created without reading the logs. */
export const SETUP_CODE = "E2E-SETUP-CODE";
export const PASSWORD = "correct horse battery staple";

const STORAGE_DIR = fileURLToPath(
	new URL("../test-results/e2e-storage", import.meta.url),
);

/** The app's environment: production build, every outside call kept local. */
export const appEnv: Record<string, string> = {
	NODE_ENV: "production",
	HOST: "127.0.0.1",
	PORT: String(APP_PORT),
	DATABASE_URL,
	BETTER_AUTH_URL: APP_URL,
	BETTER_AUTH_SECRET: "e2e-only-secret-never-used-anywhere-else-0123456789",
	SETUP_CODE,
	// Closed sign-up, as on a real server: accounts come from invitations.
	ALLOW_SIGNUP: "",
	// Have I Been Pwned is an outside service: never asked.
	PASSWORD_BREACH_CHECK: "false",
	STORAGE_DRIVER: "local",
	STORAGE_DIR,
	SMTP_HOST: "127.0.0.1",
	SMTP_PORT: "11025",
	SMTP_FROM: "Tattle <tattle@localhost>",
	SMTP_USER: "",
	SMTP_PASSWORD: "",
	// Webhooks go to the local fixtures server.
	ALLOW_PRIVATE_URLS: "true",
	// Each browser context sends its own X-Forwarded-For (see fixtures.ts), so
	// the per-IP limits of one test never reach another.
	TRUST_PROXY: "true",
	INGEST_LIMIT_PER_IP: "100000",
	INGEST_LIMIT_PER_PROJECT: "100000",
	REPORTER_READ_LIMIT_PER_IP: "100000",
	REPORTER_MESSAGE_LIMIT_PER_IP: "100000",
	PORTAL_LIMIT_PER_IP: "100000",
	GITHUB_LIMIT_PER_IP: "100000",
	REPORT_RETENTION_DAYS: "",
	TATTLE_BUILD_VERSION: "e2e",
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Throws unless every URL the suite or the app could call is on this machine. */
export function assertEverythingLocal() {
	const urls = [
		APP_URL,
		SITE_URL,
		RECEIVER_URL,
		DATABASE_URL,
		MAILPIT_URL,
		appEnv.BETTER_AUTH_URL,
		appEnv.DATABASE_URL,
	];
	for (const value of urls) {
		const { hostname } = new URL(value);
		if (!LOCAL_HOSTS.has(hostname))
			throw new Error(`Refusing to run: ${value} is not on this machine.`);
	}
	if (!LOCAL_HOSTS.has(appEnv.SMTP_HOST))
		throw new Error(`Refusing to run: SMTP_HOST ${appEnv.SMTP_HOST}.`);
	if (!new URL(DATABASE_URL).pathname.endsWith("_e2e"))
		throw new Error("Refusing to run: the database name must end in _e2e.");
	if (appEnv.PASSWORD_BREACH_CHECK !== "false")
		throw new Error("Refusing to run: the breach check calls the internet.");
}
