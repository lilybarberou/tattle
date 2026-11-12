import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The logic runs in Node: `react-native` is replaced by a small stub, so
// these tests cover the collectors and the payload, not the native UI.
export default defineConfig({
	resolve: {
		alias: {
			"react-native": fileURLToPath(
				new URL("./tests/react-native-stub.ts", import.meta.url),
			),
		},
	},
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
	},
});
