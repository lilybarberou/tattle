import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./tests/database-url.ts";

// Only what the server code needs: the `#/` alias from tsconfig.json, no
// TanStack Start, Nitro or React plugins.
export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		environment: "node",
		include: ["tests/**/*.test.{ts,tsx}"],
		globalSetup: ["tests/global-setup.ts"],
		setupFiles: ["tests/setup.ts"],
		// Test files share one database: run them one after the other.
		fileParallelism: false,
		testTimeout: 20_000,
		hookTimeout: 30_000,
		// Set before any test module is imported (src/db reads DATABASE_URL then).
		env: {
			NODE_ENV: "test",
			DATABASE_URL: testDatabaseUrl,
			BETTER_AUTH_URL: "http://localhost:3000",
			BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
			PASSWORD_BREACH_CHECK: "false",
			STORAGE_DRIVER: "local",
			REPORT_RETENTION_DAYS: "",
			ALLOW_SIGNUP: "",
		},
	},
});
