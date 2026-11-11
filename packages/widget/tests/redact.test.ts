import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redactUrl } from "../src/redact";

beforeEach(() => {
	vi.stubGlobal("location", { href: "https://app.example.com/settings?tab=1" });
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe("redactUrl", () => {
	it("redacts sensitive query parameters and keeps the others", () => {
		expect(
			redactUrl(
				"https://api.example.com/v1/items?page=2&api_key=abc&token=xyz&sessionId=s1&q=shoes",
			),
		).toBe(
			"https://api.example.com/v1/items?page=2&api_key=[redacted]&token=[redacted]&sessionId=[redacted]&q=shoes",
		);
	});

	it.each([
		"password",
		"client_secret",
		"Authorization",
		"code",
		"access_token",
		"refreshToken",
	])("treats %s as sensitive", (key) => {
		expect(redactUrl(`https://x.example.com/?${key}=value`)).toBe(
			`https://x.example.com/?${key}=[redacted]`,
		);
	});

	it("recognizes encoded keys", () => {
		expect(redactUrl("https://x.example.com/?user%5Btoken%5D=abc")).toBe(
			"https://x.example.com/?user%5Btoken%5D=[redacted]",
		);
	});

	it("redacts OAuth-style fragments but leaves plain anchors alone", () => {
		expect(
			redactUrl("https://x.example.com/cb#access_token=abc&state=ok"),
		).toBe("https://x.example.com/cb#access_token=[redacted]&state=ok");
		expect(redactUrl("https://x.example.com/docs#token-section")).toBe(
			"https://x.example.com/docs#token-section",
		);
	});

	it("resolves relative URLs against the current page", () => {
		expect(redactUrl("/api/me?auth=1")).toBe(
			"https://app.example.com/api/me?auth=[redacted]",
		);
	});

	it("keeps parameters without a value", () => {
		expect(redactUrl("https://x.example.com/?token&debug")).toBe(
			"https://x.example.com/?token&debug",
		);
	});

	it("shortens data and blob URLs", () => {
		expect(redactUrl("data:image/png;base64,AAAABBBBCCCC")).toBe(
			"data:image/png;base64,[...]",
		);
		expect(redactUrl("blob:https://app.example.com/1234")).toBe(
			"blob:https://app.example.com/1234[...]",
		);
	});

	it("caps very long URLs", () => {
		const url = redactUrl(`https://x.example.com/?q=${"a".repeat(3000)}`);
		expect(url).toHaveLength(2001);
		expect(url.endsWith("…")).toBe(true);
	});

	it("works without a page location (e.g. in a worker)", () => {
		vi.unstubAllGlobals();
		expect(redactUrl("https://x.example.com/?secret=1")).toBe(
			"https://x.example.com/?secret=[redacted]",
		);
	});
});
