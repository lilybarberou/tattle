import { describe, expect, it } from "vitest";
import {
	getConsoleEntries,
	pushConsoleEntry,
	safeStringify,
} from "../src/collectors/console";
import { scrubText } from "../src/redact";

const JWT =
	"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

describe("scrubText", () => {
	it("removes JWTs, Bearer values and secrets in URLs", () => {
		expect(scrubText(`token is ${JWT}`)).toBe("token is [redacted]");
		expect(scrubText("Authorization: Bearer abcdef123456789")).toBe(
			"Authorization: Bearer [redacted]",
		);
		expect(
			scrubText(
				"GET https://bucket.s3.example.com/a.png?X-Amz-Signature=abc&size=2 failed",
			),
		).toBe(
			"GET https://bucket.s3.example.com/a.png?X-Amz-Signature=[redacted]&size=2 failed",
		);
		expect(scrubText("see https://admin:hunter2@db.example.com/x")).toBe(
			"see https://[redacted]@db.example.com/x",
		);
		expect(scrubText("plain text, https://example.com/docs")).toBe(
			"plain text, https://example.com/docs",
		);
	});
});

describe("scrubText and plain words", () => {
	it("leaves ordinary sentences whole", () => {
		for (const sentence of [
			"Token refreshed successfully",
			"Using basic configuration for checkout",
			"Bearer tokens expire after one hour",
			"Token Refreshed, retrying",
		])
			expect(scrubText(sentence)).toBe(sentence);
	});

	it("still removes what looks like a credential", () => {
		const cases: Array<[string, string]> = [
			["Authorization: Basic dXNlcjpwYXNz", "Authorization: Basic [redacted]"],
			[
				"authorization: bearer abcdefghijklmnop",
				"authorization: bearer [redacted]",
			],
			["Token 9f8e7d6c5b4a", "Token [redacted]"],
			["Token sk_live_abcdefg", "Token [redacted]"],
			["token: refreshed", "token: [redacted]"],
			["retry with token=abcdefgh", "retry with token=[redacted]"],
		];
		for (const [input, output] of cases) expect(scrubText(input)).toBe(output);
	});
});

describe("scrubText around URLs", () => {
	it("keeps a stack frame's position and closing parenthesis", () => {
		expect(
			scrubText(
				"at load (https://cdn.example.com/app.js?token=abc:10:4)\nat main (https://cdn.example.com/app.js:2:1)",
			),
		).toBe(
			"at load (https://cdn.example.com/app.js?token=[redacted]:10:4)\nat main (https://cdn.example.com/app.js:2:1)",
		);
	});

	it("keeps the punctuation that ends a sentence", () => {
		expect(scrubText("Open (https://x.example/?code=123), then retry.")).toBe(
			"Open (https://x.example/?code=[redacted]), then retry.",
		);
		expect(scrubText("See https://x.example/reset?token=abc.")).toBe(
			"See https://x.example/reset?token=[redacted].",
		);
	});

	it("leaves a value it already redacted as it is", () => {
		const once = scrubText("GET https://x.example/a.png?X-Amz-Signature=abc");
		expect(scrubText(once)).toBe(once);
		expect(scrubText("(https://x.example/?token=[redacted])")).toBe(
			"(https://x.example/?token=[redacted])",
		);
	});

	it("leaves a port alone", () => {
		expect(scrubText("GET https://admin:pw@db.example.com:8080")).toBe(
			"GET https://[redacted]@db.example.com:8080",
		);
	});
});

describe("safeStringify", () => {
	it("redacts credential properties", () => {
		const text = safeStringify({
			headers: { Authorization: "Bearer abc", "x-api-key": "k" },
			password: "hunter2",
			statusCode: 401,
		});
		expect(JSON.parse(text)).toEqual({
			headers: { Authorization: "[redacted]", "x-api-key": "[redacted]" },
			password: "[redacted]",
			statusCode: 401,
		});
	});

	it("keeps counts and kinds that only carry the word token", () => {
		const text = safeStringify({
			accessToken: "a",
			refresh_token: "b",
			"x-csrf-token": "c",
			sessionTokenValue: "d",
			maxTokens: 512,
			tokenCount: 10,
			prompt_tokens: 3,
			token_type: "Bearer",
			tokenizer: "cl100k",
		});
		expect(JSON.parse(text)).toEqual({
			accessToken: "[redacted]",
			refresh_token: "[redacted]",
			"x-csrf-token": "[redacted]",
			sessionTokenValue: "[redacted]",
			maxTokens: 512,
			tokenCount: 10,
			prompt_tokens: 3,
			token_type: "Bearer",
			tokenizer: "cl100k",
		});
	});

	it("does not run getters", () => {
		let ran = false;
		const value = {
			get expensive() {
				ran = true;
				return 1;
			},
		};
		expect(JSON.parse(safeStringify(value))).toEqual({
			expensive: "[Getter]",
		});
		expect(ran).toBe(false);
	});

	it("stops after a global budget of values", () => {
		// 20 keys at each of 4 levels: 160,000 values, every object within the
		// depth and key limits, so only the global budget can stop the walk.
		// Counted, not timed: a busy machine made a time limit fail.
		const level = (depth: number): unknown =>
			depth === 0
				? 1
				: Object.fromEntries(
						Array.from({ length: 20 }, (_, i) => [`k${i}`, level(depth - 1)]),
					);
		const text = safeStringify(level(4));
		const values = text.match(/"k\d+":1\b/g) ?? [];
		expect(values.length).toBeGreaterThan(1000);
		expect(values.length).toBeLessThan(2000);
		expect(text).toMatch(/\[…\]|more keys/);
	});
});

describe("console entries", () => {
	it("are scrubbed before they are kept", () => {
		pushConsoleEntry("error", `request failed with Bearer ${JWT}`);
		const entry = getConsoleEntries().at(-1);
		expect(entry?.message).toBe("request failed with Bearer [redacted]");
	});
});
