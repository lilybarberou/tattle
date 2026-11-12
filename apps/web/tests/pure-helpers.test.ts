import { afterEach, describe, expect, it, vi } from "vitest";
import { passwordPolicy } from "#/lib/password-policy";
import { limitIngest, limitPortal } from "#/server/rate-limit";
import { buildTrail, trailLine } from "#/shared/trail";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

describe("rate limits", () => {
	it("allows reports per IP up to the limit, then asks to wait", () => {
		vi.stubEnv("INGEST_LIMIT_PER_IP", "3");
		const results = Array.from({ length: 4 }, () =>
			limitIngest("10.0.0.1", "pk_a"),
		);
		expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
		expect(results[3]?.retryAfter).toBeGreaterThan(0);
		expect(results[3]?.retryAfter).toBeLessThanOrEqual(600);
		// Another IP has its own window.
		expect(limitIngest("10.0.0.2", "pk_a").ok).toBe(true);
	});

	it("limits a project key across IPs", () => {
		vi.stubEnv("INGEST_LIMIT_PER_PROJECT", "2");
		expect(limitIngest("10.1.0.1", "pk_b").ok).toBe(true);
		expect(limitIngest("10.1.0.2", "pk_b").ok).toBe(true);
		expect(limitIngest("10.1.0.3", "pk_b").ok).toBe(false);
		expect(limitIngest("10.1.0.4", "pk_other").ok).toBe(true);
	});

	it("opens a new window once the old one has expired", () => {
		vi.useFakeTimers();
		vi.stubEnv("INGEST_LIMIT_PER_IP", "1");
		expect(limitIngest("10.2.0.1", "pk_c").ok).toBe(true);
		expect(limitIngest("10.2.0.1", "pk_c").ok).toBe(false);
		vi.advanceTimersByTime(10 * 60_000 + 1);
		expect(limitIngest("10.2.0.1", "pk_c").ok).toBe(true);
	});

	it("falls back to the default when the env value is not a positive number", () => {
		vi.stubEnv("PORTAL_LIMIT_PER_IP", "zero");
		const results = Array.from({ length: 31 }, () => limitPortal("10.3.0.1"));
		expect(results.filter((r) => r.ok)).toHaveLength(30);
		expect(results.at(-1)?.ok).toBe(false);
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
