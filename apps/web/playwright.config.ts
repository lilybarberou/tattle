import { defineConfig, devices } from "@playwright/test";
import { APP_URL, assertEverythingLocal, FIXTURES_PORT } from "./e2e/config.ts";

// Refuse to start if anything the suite or the app would call is not local.
assertEverythingLocal();

/**
 * End-to-end suite: `pnpm test:e2e` (see e2e/README.md). Needs the containers
 * of e2e/docker-compose.e2e.yml and a production build.
 */
export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/*.spec.ts",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	// One retry in CI only: a test that passes on its second try is reported
	// as flaky, not hidden. Locally, a failure is a failure.
	retries: process.env.CI ? 1 : 0,
	// Two workers by default: password hashing, screenshots and the widget's
	// capture are CPU-heavy, and a busy machine turns waits into timeouts.
	// E2E_WORKERS=4 on a quiet one.
	workers: Number(process.env.E2E_WORKERS) || 2,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: [
		["list"],
		["html", { open: "never", outputFolder: "playwright-report" }],
		// Read by e2e/a11y-summary.ts: the accessibility warnings of a run.
		["json", { outputFile: "test-results/e2e-results.json" }],
	],
	outputDir: "test-results/e2e",
	use: {
		baseURL: APP_URL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		locale: "en-US",
		timezoneId: "Europe/Paris",
		// No transitions: nothing to wait for, and axe never measures the
		// contrast of an element halfway through fading in.
		reducedMotion: "reduce",
	},
	projects: [
		// The very first account of a fresh server: runs alone, before the rest.
		{
			name: "first-run",
			testMatch: "**/first-run.spec.ts",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "chromium",
			testIgnore: "**/first-run.spec.ts",
			dependencies: ["first-run"],
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: [
		{
			command: "node e2e/start-app.ts",
			url: `${APP_URL}/health`,
			reuseExistingServer: false,
			timeout: 120_000,
			stdout: "pipe",
			stderr: "pipe",
		},
		{
			command: "node e2e/fixtures-server.ts",
			url: `http://127.0.0.1:${FIXTURES_PORT}/health`,
			reuseExistingServer: false,
			timeout: 30_000,
		},
	],
});
