import { defineConfig } from "vitest/config";

// Pure helpers only: they run in Node, without a DOM.
export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
	},
});
