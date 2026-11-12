import { describe, expect, it } from "vitest";
import { getStrings } from "../src/i18n";
import { buildReporter } from "../src/payload";
import {
	generateReporterKey,
	type KeyStore,
	myReportsUrl,
	reporterHeaders,
	reporterKey,
	storageKey,
} from "../src/reporter";
import { statusLabel } from "../src/ui/inbox";

const mapStore = (): KeyStore & { data: Map<string, string> } => {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => {
			data.set(key, value);
		},
	};
};

describe("reporterKey", () => {
	it("creates a key only when asked, then keeps it per project", () => {
		const store = mapStore();
		expect(reporterKey("pk_a", false, store)).toBeNull();
		const key = reporterKey("pk_a", true, store);
		expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(reporterKey("pk_a", false, store)).toBe(key);
		expect(reporterKey("pk_a", true, store)).toBe(key);
		expect(store.data.get(storageKey("pk_a"))).toBe(key);
		expect(reporterKey("pk_b", false, store)).toBeNull();
	});

	it("replaces a stored value that is not a key", () => {
		const store = mapStore();
		store.setItem(storageKey("pk_a"), "<script>");
		expect(reporterKey("pk_a", false, store)).toBeNull();
		expect(reporterKey("pk_a", true, store)).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("still works when storage throws", () => {
		const broken: KeyStore = {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {
				throw new Error("denied");
			},
		};
		expect(reporterKey("pk_a", true, broken)).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("generates different high-entropy keys", () => {
		const keys = new Set(Array.from({ length: 50 }, generateReporterKey));
		expect(keys.size).toBe(50);
	});
});

describe("reporterHeaders", () => {
	it("asks for nothing without a device key or a verified user", () => {
		expect(
			reporterHeaders({ projectKey: "pk_a", reporterKey: null, user: null }),
		).toBeNull();
		// A user id alone opens nothing on the server: no request at all.
		expect(
			reporterHeaders({
				projectKey: "pk_a",
				reporterKey: null,
				user: { id: "u-1" },
			}),
		).toBeNull();
	});

	it("sends the device key, and the user id only with its hash", () => {
		expect(
			reporterHeaders({
				projectKey: "pk_a",
				reporterKey: "k".repeat(43),
				user: { id: "u-1" },
			}),
		).toEqual({
			"x-tattle-project-key": "pk_a",
			"x-tattle-reporter-key": "k".repeat(43),
		});
		expect(
			reporterHeaders({
				projectKey: "pk_a",
				reporterKey: null,
				user: { id: 42, hash: "abc" } as never,
			}),
		).toEqual({
			"x-tattle-project-key": "pk_a",
			"x-tattle-user-id": "42",
			"x-tattle-user-hash": "abc",
		});
	});

	it("builds the endpoint from the server URL", () => {
		expect(myReportsUrl("https://t.example.com/")).toBe(
			"https://t.example.com/api/v1/my-reports",
		);
	});
});

describe("identity hash", () => {
	it("never ends up in the reporter's traits", () => {
		expect(
			buildReporter({ id: "u-1", hash: "secret-signature", plan: "pro" }),
		).toEqual({ id: "u-1", traits: { plan: "pro" } });
	});
});

describe("statusLabel", () => {
	it("says the status in the reporter's words, in both languages", () => {
		const en = getStrings("en");
		const fr = getStrings("fr");
		expect(statusLabel(en, "received", "bug")).toBe("Received");
		expect(statusLabel(en, "fixed", "bug")).toBe("Fixed");
		expect(statusLabel(en, "fixed", "feature")).toBe("Available");
		expect(statusLabel(fr, "wont_fix", "feature")).toBe("Non retenu");
		expect(statusLabel(fr, "in_progress", "bug")).toBe("En cours");
	});
});
