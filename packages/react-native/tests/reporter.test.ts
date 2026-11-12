import { afterEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "../src/i18n";
import type { KeyValueStore } from "../src/optional";
import { buildPayload, buildReporter } from "../src/payload";
import {
	clearReporterKeys,
	generateReporterKey,
	reporterHeaders,
	reporterKey,
	statusLabel,
	storageKey,
} from "../src/reporter";

const KEY = /^[A-Za-z0-9_-]{43}$/;

const mapStore = (): KeyValueStore & { data: Map<string, string> } => {
	const data = new Map<string, string>();
	return {
		data,
		getItem: async (key) => data.get(key) ?? null,
		setItem: async (key, value) => {
			data.set(key, value);
		},
	};
};

afterEach(() => {
	clearReporterKeys();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("generateReporterKey", () => {
	it("makes 43 base64url characters from 32 random bytes", () => {
		const keys = new Set(Array.from({ length: 50 }, generateReporterKey));
		expect(keys.size).toBe(50);
		for (const key of keys) expect(key).toMatch(KEY);
	});

	it("still makes a key without crypto, and says how to fix it", () => {
		vi.stubGlobal("crypto", undefined);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(generateReporterKey()).toMatch(KEY);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("expo-crypto"));
	});
});

describe("reporterKey", () => {
	it("creates a key only when a report is sent, then reads it back from storage", async () => {
		const store = mapStore();
		expect(await reporterKey("pk_a", false, store)).toBeNull();
		const key = await reporterKey("pk_a", true, store);
		expect(key).toMatch(KEY);
		expect(store.data.get(storageKey("pk_a"))).toBe(key);
		// After a restart, memory is empty: the stored key comes back.
		clearReporterKeys();
		expect(await reporterKey("pk_a", false, store)).toBe(key);
		expect(await reporterKey("pk_b", false, store)).toBeNull();
	});

	it("keeps the key in memory without a storage module, and warns once", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const key = await reporterKey("pk_a", true, null);
		expect(key).toMatch(KEY);
		expect(await reporterKey("pk_a", false, null)).toBe(key);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("expo-secure-store"),
		);
	});

	it("survives a storage that fails", async () => {
		const broken: KeyValueStore = {
			getItem: () => Promise.reject(new Error("locked")),
			setItem: () => Promise.reject(new Error("locked")),
		};
		const key = await reporterKey("pk_a", true, broken);
		expect(key).toMatch(KEY);
		expect(await reporterKey("pk_a", false, broken)).toBe(key);
	});
});

describe("reporterHeaders", () => {
	it("sends the user id only with its hash, and nothing without a key or hash", () => {
		expect(
			reporterHeaders({
				projectKey: "pk_a",
				reporterKey: null,
				user: { id: "u-1" },
			}),
		).toBeNull();
		expect(
			reporterHeaders({
				projectKey: "pk_a",
				reporterKey: "k".repeat(43),
				user: { id: "u-1", hash: "abc" },
			}),
		).toEqual({
			"x-tattle-project-key": "pk_a",
			"x-tattle-reporter-key": "k".repeat(43),
			"x-tattle-user-id": "u-1",
			"x-tattle-user-hash": "abc",
		});
	});
});

describe("payload", () => {
	it("sends the key and the hash, never the hash as a trait", () => {
		expect(buildReporter({ id: "u-1", hash: "sig", plan: "pro" })).toEqual({
			id: "u-1",
			traits: { plan: "pro" },
		});
		const payload = buildPayload({
			projectKey: "pk_a",
			type: "bug",
			message: "Crash",
			user: { id: "u-1", hash: "sig" },
			context: null,
			screen: "Home",
			reporterKey: "k".repeat(43),
		});
		expect(payload).toMatchObject({
			reporterKey: "k".repeat(43),
			userHash: "sig",
			reporter: { id: "u-1" },
		});
		// No user id: a hash means nothing.
		expect(
			buildPayload({
				projectKey: "pk_a",
				type: "bug",
				message: "Crash",
				user: { hash: "sig" },
				context: null,
				screen: "Home",
			}).userHash,
		).toBeUndefined();
	});
});

describe("statusLabel", () => {
	it("speaks the reporter's language", () => {
		expect(statusLabel(getStrings("en"), "fixed", "feature")).toBe("Available");
		expect(statusLabel(getStrings("fr"), "planned", "bug")).toBe("Prévu");
	});
});
