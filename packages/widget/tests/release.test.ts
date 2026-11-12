import { describe, expect, it } from "vitest";
import { cleanRelease } from "../src/payload";

describe("cleanRelease", () => {
	it("trims the release and caps it at 100 characters", () => {
		expect(cleanRelease(" 1.4.2 ")).toBe("1.4.2");
		expect(cleanRelease(142)).toBe("142");
		expect(cleanRelease("x".repeat(120))).toHaveLength(100);
	});

	it("drops anything that is not a release", () => {
		expect(cleanRelease("  ")).toBeUndefined();
		expect(cleanRelease(undefined)).toBeUndefined();
		expect(cleanRelease({ version: "1" })).toBeUndefined();
	});
});
