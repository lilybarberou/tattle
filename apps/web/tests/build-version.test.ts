import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "#/server/env";

describe("env.build", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("links a release to its notes", () => {
		vi.stubEnv("TATTLE_BUILD_VERSION", "0.2.1");
		vi.stubEnv(
			"TATTLE_BUILD_COMMIT",
			"382e31eb3c4adac75496755971f655e56c5704b9",
		);
		expect(env.build).toEqual({
			version: "0.2.1",
			url: "https://github.com/lilybarberou/tattle/releases/tag/v0.2.1",
		});
	});

	it("names the commit of a branch image", () => {
		vi.stubEnv("TATTLE_BUILD_VERSION", "main");
		vi.stubEnv(
			"TATTLE_BUILD_COMMIT",
			"382e31eb3c4adac75496755971f655e56c5704b9",
		);
		expect(env.build).toEqual({
			version: "main (382e31e)",
			url: "https://github.com/lilybarberou/tattle/commit/382e31eb3c4adac75496755971f655e56c5704b9",
		});
	});

	it("says dev when run from source", () => {
		vi.stubEnv("TATTLE_BUILD_VERSION", "");
		vi.stubEnv("TATTLE_BUILD_COMMIT", "");
		expect(env.build).toEqual({ version: "dev" });
	});
});
