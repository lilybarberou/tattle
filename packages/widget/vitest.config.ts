import { defineConfig } from "vitest/config";

// Pure helpers only: they run in Node, without a DOM.
export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,tsx}"],
			reporter: ["text", "json-summary"],
		},
	},
});
