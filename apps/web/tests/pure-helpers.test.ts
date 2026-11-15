import { Cause } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { passwordPolicy } from "#/lib/password-policy";
import { causeKinds, errorKind } from "#/server/background";
import { DbError } from "#/server/errors";
import {
	captureMail,
	isSingleAddress,
	sendMail,
	stopCapturingMail,
} from "#/server/mailer";
import {
	forwardedClientIp,
	limitGithub,
	limitIngestIp,
	limitIngestProject,
	limitPortal,
	trustedProxyHops,
} from "#/server/rate-limit";
import { buildTrail, trailLine } from "#/shared/trail";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

describe("rate limits", () => {
	it("allows reports per IP up to the limit, then asks to wait", () => {
		vi.stubEnv("INGEST_LIMIT_PER_IP", "3");
		const results = Array.from({ length: 4 }, () => limitIngestIp("10.0.0.1"));
		expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
		expect(results[3]?.retryAfter).toBeGreaterThan(0);
		expect(results[3]?.retryAfter).toBeLessThanOrEqual(600);
		// Another IP has its own window.
		expect(limitIngestIp("10.0.0.2").ok).toBe(true);
	});

	it("limits a project key across IPs", () => {
		vi.stubEnv("INGEST_LIMIT_PER_PROJECT", "2");
		expect(limitIngestProject("pk_b").ok).toBe(true);
		expect(limitIngestProject("pk_b").ok).toBe(true);
		expect(limitIngestProject("pk_b").ok).toBe(false);
		expect(limitIngestProject("pk_other").ok).toBe(true);
	});

	it("limits GitHub deliveries per IP across project ids too", () => {
		vi.stubEnv("GITHUB_LIMIT_PER_IP", "1");
		expect(limitGithub("10.3.0.1", "p1").ok).toBe(true);
		expect(limitGithub("10.3.0.1", "p1").ok).toBe(false);
		// A new project id each time: still limited, at 4 times the limit.
		const results = ["p2", "p3", "p4", "p5"].map(
			(id) => limitGithub("10.3.0.1", id).ok,
		);
		expect(results).toEqual([true, true, false, false]);
		expect(limitGithub("10.3.0.2", "p1").ok).toBe(true);
	});

	it("opens a new window once the old one has expired", () => {
		vi.useFakeTimers();
		vi.stubEnv("INGEST_LIMIT_PER_IP", "1");
		expect(limitIngestIp("10.2.0.1").ok).toBe(true);
		expect(limitIngestIp("10.2.0.1").ok).toBe(false);
		vi.advanceTimersByTime(10 * 60_000 + 1);
		expect(limitIngestIp("10.2.0.1").ok).toBe(true);
	});

	it("falls back to the default when the env value is not a positive number", () => {
		vi.stubEnv("PORTAL_LIMIT_PER_IP", "zero");
		const results = Array.from({ length: 31 }, () => limitPortal("10.3.0.1"));
		expect(results.filter((r) => r.ok)).toHaveLength(30);
		expect(results.at(-1)?.ok).toBe(false);
	});
});

describe("the client IP behind proxies", () => {
	it("trusts X-Forwarded-For only with TRUST_PROXY", () => {
		expect(trustedProxyHops(undefined)).toBe(0);
		expect(trustedProxyHops("false")).toBe(0);
		expect(trustedProxyHops("true")).toBe(1);
		expect(trustedProxyHops("2")).toBe(2);
		expect(trustedProxyHops("0")).toBe(0);
		expect(trustedProxyHops("-1")).toBe(0);
	});

	it("takes the address the trusted proxy added, not what the client wrote", () => {
		// nginx with $proxy_add_x_forwarded_for appends the real address.
		expect(forwardedClientIp("192.0.2.4, 203.0.113.7", 1)).toBe("203.0.113.7");
		expect(forwardedClientIp("203.0.113.7", 1)).toBe("203.0.113.7");
		// A CDN, then nginx: the client is second from the right.
		expect(forwardedClientIp("192.0.2.66, 203.0.113.7, 198.51.100.1", 2)).toBe(
			"203.0.113.7",
		);
		expect(forwardedClientIp("203.0.113.7", 2)).toBe("203.0.113.7");
		expect(forwardedClientIp("", 1)).toBeUndefined();
		expect(forwardedClientIp(null, 1)).toBeUndefined();
		expect(forwardedClientIp("192.0.2.4", 0)).toBeUndefined();
	});
});

describe("passwordPolicy", () => {
	it("defaults to 8 characters and the breach check", () => {
		vi.stubEnv("MIN_PASSWORD_LENGTH", undefined);
		vi.stubEnv("PASSWORD_BREACH_CHECK", undefined);
		expect(passwordPolicy()).toEqual({ minLength: 8, breachCheck: true });
	});

	it("reads MIN_PASSWORD_LENGTH from 6 to 128", () => {
		vi.stubEnv("MIN_PASSWORD_LENGTH", "12");
		expect(passwordPolicy().minLength).toBe(12);
		for (const invalid of ["5", "129", "10.5", "twelve"]) {
			vi.stubEnv("MIN_PASSWORD_LENGTH", invalid);
			expect(passwordPolicy().minLength).toBe(8);
		}
	});

	it("turns the breach check off only with PASSWORD_BREACH_CHECK=false", () => {
		vi.stubEnv("PASSWORD_BREACH_CHECK", "false");
		expect(passwordPolicy().breachCheck).toBe(false);
		vi.stubEnv("PASSWORD_BREACH_CHECK", "0");
		expect(passwordPolicy().breachCheck).toBe(true);
	});
});

describe("the trail before a report", () => {
	it("interleaves steps with errors and failed requests, oldest first", () => {
		const at = (seconds: number) => Date.UTC(2026, 0, 2, 9, 0, seconds);
		const trail = buildTrail({
			breadcrumbs: [
				{ category: "navigation", message: "/cart", timestamp: at(1) },
				{ category: "click", message: "button “Pay”", timestamp: at(4) },
			],
			console: [
				{ level: "warn", message: "slow", timestamp: at(2) },
				{ level: "error", message: "TypeError:\n  boom", timestamp: at(4) },
			],
			network: [
				{
					method: "GET",
					url: "/a",
					status: 200,
					durationMs: 1,
					timestamp: at(3),
				},
				{
					method: "POST",
					url: "/pay",
					status: 0,
					durationMs: 1,
					timestamp: at(5),
					error: "Network error",
				},
				{
					method: "GET",
					url: "/b",
					status: 404,
					durationMs: 1,
					timestamp: at(6),
				},
			],
		});
		expect(trail.map(trailLine)).toEqual([
			"09:00:01 navigation: /cart",
			"09:00:04 click: button “Pay”",
			"09:00:04 console error: TypeError: boom",
			"09:00:05 failed request: POST /pay → Network error",
			"09:00:06 failed request: GET /b → 404",
		]);
	});

	it("survives a timestamp no clock can show", () => {
		expect(
			trailLine({
				kind: "step",
				category: "custom",
				message: "x",
				timestamp: 1e20,
			}),
		).toBe("--:--:-- custom: x");
	});
});

describe("error kinds in logs", () => {
	it("keep the tag and the cause's code, never the message", () => {
		const smtp = Object.assign(
			new Error("550 5.1.1 <jo@example.com>: Recipient address rejected"),
			{ code: "EENVELOPE" },
		);
		expect(errorKind({ _tag: "UnknownError", cause: smtp })).toBe(
			"UnknownError EENVELOPE",
		);
		const sql = new DbError({
			cause: Object.assign(new Error("insert … params: jo@example.com"), {
				cause: { code: "23505", detail: "Key (email)=(jo@example.com)" },
			}),
		});
		expect(errorKind(sql)).toBe("DbError 23505");
		expect(errorKind(new Error("jo@example.com"))).toBe("Error");
		expect(causeKinds(Cause.fail(sql))).toBe("DbError 23505");
		expect(
			JSON.stringify([errorKind(sql), causeKinds(Cause.fail(sql))]),
		).not.toContain("jo@example.com");
	});
});

describe("email recipients", () => {
	it("are one plain address", () => {
		for (const ok of ["ada@example.com", "a.b+tag@mail.example.org"])
			expect(isSingleAddress(ok), ok).toBe(true);
		for (const bad of [
			"a@example.com, b@example.org",
			"a@example.com;b@example.org",
			"Ada <a@example.com>",
			"a@example.com b@example.org",
			"not-an-email",
			"@example.com",
			"ada@localhost",
		])
			expect(isSingleAddress(bad), bad).toBe(false);
	});

	it("never go out as a list someone typed", async () => {
		const outbox = captureMail();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			expect(
				await sendMail({
					to: "me@example.com, victim@example.org",
					subject: "Your report",
					text: "Thanks",
				}),
			).toBe(false);
			expect(outbox).toEqual([]);
			expect(warn.mock.calls.flat().join(" ")).not.toContain("victim");
		} finally {
			stopCapturingMail();
			warn.mockRestore();
		}
	});
});
