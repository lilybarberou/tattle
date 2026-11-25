import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyBeforeSend,
	applyCollection,
	parseCollect,
	ReportDropped,
} from "../src/collection";
import { addBreadcrumb, getBreadcrumbs } from "../src/collectors/breadcrumbs";
import { getConsoleEntries } from "../src/collectors/console";
import { getNetworkEntries } from "../src/collectors/network";
import { internalState } from "../src/internal";
import type { IngestPayload } from "../src/types";

// No DOM: `window`, `document` and `history` are EventTarget stand-ins, and
// `fetch` a double that never leaves the process.

const originalLog = console.log;
let win: EventTarget & { fetch?: typeof fetch };
let doc: EventTarget;
let pageFetch: typeof fetch;
const history = {
	pushState: () => {},
	replaceState: () => {},
};
const originalPushState = history.pushState;

class FakeXhr {
	open() {}
	send() {}
	addEventListener() {}
}

beforeEach(() => {
	console.log = () => {};
	pageFetch = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
	win = Object.assign(new EventTarget(), { fetch: pageFetch });
	doc = new EventTarget();
	vi.stubGlobal("window", win);
	vi.stubGlobal("document", doc);
	vi.stubGlobal("history", history);
	vi.stubGlobal("location", { href: "https://shop.example.com/" });
	vi.stubGlobal("XMLHttpRequest", FakeXhr);
	internalState.capturing = 0;
});

afterEach(() => {
	applyCollection({ console: false, network: false, steps: false });
	console.log = originalLog;
	vi.unstubAllGlobals();
});

describe("turning collectors off", () => {
	it("restores what each one patched and forgets what it kept", async () => {
		applyCollection(undefined);
		console.log("before init: card 4242");
		await window.fetch("https://api.example.com/orders");
		expect(getConsoleEntries()).toHaveLength(1);
		expect(getNetworkEntries()).toHaveLength(1);
		expect(console.log).not.toBe(originalLog);
		expect(window.fetch).not.toBe(pageFetch);
		expect(history.pushState).not.toBe(originalPushState);

		applyCollection({ console: false, network: false, steps: false });
		// Nothing gathered before init can be sent, and nothing is patched.
		expect(getConsoleEntries()).toEqual([]);
		expect(getNetworkEntries()).toEqual([]);
		expect(window.fetch).toBe(pageFetch);
		expect(history.pushState).toBe(originalPushState);
		console.log("after init");
		await window.fetch("https://api.example.com/cart");
		expect(getConsoleEntries()).toEqual([]);
		expect(getNetworkEntries()).toEqual([]);
	});

	it("keeps the ones left on", async () => {
		applyCollection({ network: false });
		console.log("kept");
		await window.fetch("https://api.example.com/orders");
		expect(getConsoleEntries().map((e) => e.message)).toEqual(["kept"]);
		expect(getNetworkEntries()).toEqual([]);
		expect(window.fetch).toBe(pageFetch);
	});

	it("still keeps the steps the app adds itself", () => {
		applyCollection({ steps: false });
		addBreadcrumb({ message: "Checkout opened" });
		expect(getBreadcrumbs().map((b) => b.message)).toEqual(["Checkout opened"]);
	});

	it("starts them again when turned back on", () => {
		applyCollection({ console: false });
		applyCollection(undefined);
		console.log("back");
		expect(getConsoleEntries().map((e) => e.message)).toEqual(["back"]);
	});
});

describe("data-collect", () => {
	it("lists the collectors to keep", () => {
		expect(parseCollect(null)).toBeUndefined();
		expect(parseCollect("console, network")).toEqual({
			console: true,
			network: true,
			steps: false,
		});
		expect(parseCollect("STEPS")).toEqual({
			console: false,
			network: false,
			steps: true,
		});
		expect(parseCollect("none")).toEqual({
			console: false,
			network: false,
			steps: false,
		});
		expect(parseCollect("")).toEqual({
			console: false,
			network: false,
			steps: false,
		});
	});
});

describe("beforeSend", () => {
	const report = (): IngestPayload => ({
		projectKey: "pk_0123456789abcdef0123456789abcdef",
		type: "bug",
		message: "Order 1234 failed for jo@example.com",
		screenshot: "data:image/png;base64,AAAA",
		pageUrl: "https://shop.example.com/checkout",
		device: {} as IngestPayload["device"],
		console: [{ level: "log", message: "hello", timestamp: 1 }],
		network: [],
		breadcrumbs: [],
		sdk: { name: "@tattlehq/widget", version: "0.1.0" },
	});

	it("sends the report as is without one", async () => {
		const original = report();
		expect(await applyBeforeSend(original, undefined)).toBe(original);
	});

	it("sends what it returns, from a copy", async () => {
		const original = report();
		const sent = await applyBeforeSend(original, (r) => {
			r.message = r.message.replace(/\S+@\S+/g, "[email]");
			delete r.screenshot;
			r.console = [];
			return r;
		});
		expect(sent).toMatchObject({
			message: "Order 1234 failed for [email]",
			console: [],
		});
		expect(sent.screenshot).toBeUndefined();
		// The widget's own copy is untouched.
		expect(original.message).toContain("jo@example.com");
		expect(original.screenshot).toBeDefined();
	});

	it("waits for an async one", async () => {
		const sent = await applyBeforeSend(report(), async (r) => ({
			...r,
			context: { checked: true },
		}));
		expect(sent.context).toEqual({ checked: true });
	});

	it("drops the report on null, on anything but an object, or when it throws", async () => {
		await expect(applyBeforeSend(report(), () => null)).rejects.toBeInstanceOf(
			ReportDropped,
		);
		await expect(
			applyBeforeSend(report(), () => "yes" as unknown as IngestPayload),
		).rejects.toBeInstanceOf(ReportDropped);
		await expect(
			applyBeforeSend(report(), () => {
				throw new Error("bug in the app's hook");
			}),
		).rejects.toBeInstanceOf(ReportDropped);
	});

	it("never lets it change the project", async () => {
		const sent = await applyBeforeSend(report(), (r) => ({
			...r,
			projectKey: "pk_ffffffffffffffffffffffffffffffff",
		}));
		expect(sent.projectKey).toBe("pk_0123456789abcdef0123456789abcdef");
	});
});
