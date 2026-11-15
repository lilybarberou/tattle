import { describe, expect, it } from "vitest";
import { isPortalSlug, PORTAL_SLUG_PATTERN } from "#/shared/portal-slug";

// What a browser does with <input pattern>: it compiles the value with the
// `v` flag, anchored to the whole value (HTML standard, "pattern attribute").
const asBrowserPattern = (pattern: string) =>
	new RegExp(`^(?:${pattern})$`, "v");

const VALID = ["abc", "acme-ideas", "0-9", "a".repeat(40), "shop-2026"];
const INVALID = [
	"",
	"ab",
	"-abc",
	"a".repeat(41),
	"Acme",
	"acme ideas",
	"acme_ideas",
	"acmé",
	"acme/ideas",
];

describe("public page address pattern", () => {
	it("compiles with the v flag, as browsers compile the pattern attribute", () => {
		expect(() => asBrowserPattern(PORTAL_SLUG_PATTERN)).not.toThrow();
	});

	it("would not have compiled with the dash left unescaped", () => {
		// The pattern of tattle 0.5.0: Chrome logged "Invalid character class"
		// and skipped the check.
		expect(() => asBrowserPattern("[a-z0-9][a-z0-9-]{2,39}")).toThrow(
			SyntaxError,
		);
	});

	it("accepts in the browser exactly what the server accepts", () => {
		const browser = asBrowserPattern(PORTAL_SLUG_PATTERN);
		for (const value of VALID) {
			expect(browser.test(value), value).toBe(true);
			expect(isPortalSlug(value), value).toBe(true);
		}
		for (const value of INVALID) {
			expect(browser.test(value), value).toBe(false);
			expect(isPortalSlug(value), value).toBe(false);
		}
	});
});
