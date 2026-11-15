import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getNetworkEntries,
	getOriginalFetch,
	installNetworkCollector,
	uninstallNetworkCollector,
} from "../src/collectors/network";
import { internalInit, internalState } from "../src/internal";

// No DOM and no network: `window.fetch` and XMLHttpRequest are doubles that
// answer what each test says.

type Listener = (event: Event) => void;

class FakeXhr {
	static next: { status: number; fail?: "error" | "abort" | "timeout" } = {
		status: 200,
	};
	status = 0;
	private listeners = new Map<string, Set<Listener>>();
	open(_method: string, _url: string) {}
	send(_body?: unknown) {
		const { status, fail } = FakeXhr.next;
		queueMicrotask(() => {
			if (fail) this.emit(fail);
			else this.status = status;
			this.emit("loadend");
		});
	}
	addEventListener(type: string, listener: Listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(listener);
	}
	removeEventListener(type: string, listener: Listener) {
		this.listeners.get(type)?.delete(listener);
	}
	listenerCount() {
		let n = 0;
		for (const set of this.listeners.values()) n += set.size;
		return n;
	}
	private emit(type: string) {
		for (const listener of [...(this.listeners.get(type) ?? [])])
			listener({ type } as Event);
	}
}

let fetchImpl: (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;
const rawFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
	fetchImpl(input, init),
);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	fetchImpl = async () => new Response("ok", { status: 200 });
	rawFetch.mockClear();
	FakeXhr.next = { status: 200 };
	const win = { fetch: rawFetch } as unknown as Window & typeof globalThis;
	vi.stubGlobal("window", win);
	vi.stubGlobal("location", { href: "https://shop.example.com/cart" });
	vi.stubGlobal("XMLHttpRequest", FakeXhr);
	internalState.capturing = 0;
	internalState.ignoredUrls = [];
	installNetworkCollector();
});

afterEach(() => {
	uninstallNetworkCollector();
	vi.unstubAllGlobals();
});

describe("the fetch collector", () => {
	it("records method, redacted absolute URL, status and timing", async () => {
		const response = await window.fetch("/api/orders?token=abc&page=2", {
			method: "post",
		});
		expect(response.status).toBe(200);
		await settle();
		expect(getNetworkEntries()).toEqual([
			{
				method: "POST",
				url: "https://shop.example.com/api/orders?token=[redacted]&page=2",
				status: 200,
				durationMs: expect.any(Number),
				timestamp: expect.any(Number),
			},
		]);
	});

	it("reads the method and URL of a Request and of a URL", async () => {
		await window.fetch(
			new Request("https://api.example.com/items", { method: "DELETE" }),
		);
		await window.fetch(new URL("https://api.example.com/search?q=shoes"));
		await settle();
		expect(getNetworkEntries().map((e) => [e.method, e.url])).toEqual([
			["DELETE", "https://api.example.com/items"],
			["GET", "https://api.example.com/search?q=shoes"],
		]);
	});

	it("records failures with status 0 and the error, and still rejects", async () => {
		fetchImpl = async () => {
			throw new TypeError("Failed to fetch");
		};
		await expect(window.fetch("https://api.example.com/x")).rejects.toThrow(
			"Failed to fetch",
		);
		await settle();
		expect(getNetworkEntries()).toMatchObject([
			{ status: 0, error: "TypeError: Failed to fetch" },
		]);
	});

	it("records HTTP errors as they are", async () => {
		fetchImpl = async () => new Response("no", { status: 503 });
		await window.fetch("https://api.example.com/x");
		await settle();
		expect(getNetworkEntries()[0]?.status).toBe(503);
	});

	it("ignores the SDK's own requests and ignored URLs", async () => {
		internalState.ignoredUrls = ["https://tattle.example.com/api/"];
		await window.fetch("https://tattle.example.com/api/v1/ingest", {
			method: "POST",
		});
		await window.fetch("https://api.example.com/x", internalInit({}));
		await settle();
		expect(getNetworkEntries()).toEqual([]);
		expect(rawFetch).toHaveBeenCalledTimes(2);
	});

	it("ignores assets fetched while a screenshot is taken, and only then", async () => {
		internalState.capturing = 1;
		await window.fetch("https://cdn.example.com/font.woff2");
		await window.fetch("https://fonts.googleapis.com/css2?family=Inter");
		await window.fetch("https://api.example.com/data.json");
		await window.fetch("https://cdn.example.com/logo.png", { method: "POST" });
		internalState.capturing = 0;
		await window.fetch("https://cdn.example.com/logo.png");
		await settle();
		expect(getNetworkEntries().map((e) => e.url)).toEqual([
			"https://api.example.com/data.json",
			"https://cdn.example.com/logo.png",
			"https://cdn.example.com/logo.png",
		]);
	});

	it("keeps the last 100 requests", async () => {
		for (let i = 0; i < 105; i++)
			await window.fetch(`https://api.example.com/${i}`);
		await settle();
		const entries = getNetworkEntries();
		expect(entries).toHaveLength(100);
		expect(entries[0]?.url).toBe("https://api.example.com/5");
		expect(entries.at(-1)?.url).toBe("https://api.example.com/104");
	});

	it("gives the SDK the untouched fetch", async () => {
		await getOriginalFetch()("https://api.example.com/x");
		await settle();
		expect(getNetworkEntries()).toEqual([]);
		expect(rawFetch).toHaveBeenCalledTimes(1);
	});

	it("installs once and restores fetch, unless the page wrapped it again", async () => {
		const wrapped = window.fetch;
		installNetworkCollector();
		expect(window.fetch).toBe(wrapped);
		uninstallNetworkCollector();
		expect(window.fetch).toBe(rawFetch);
		expect(getNetworkEntries()).toEqual([]);

		installNetworkCollector();
		const pageWrapper = vi.fn() as unknown as typeof fetch;
		window.fetch = pageWrapper;
		uninstallNetworkCollector();
		expect(window.fetch).toBe(pageWrapper);
	});
});

describe("the XMLHttpRequest collector", () => {
	const request = async (method: string, url: string) => {
		const xhr = new XMLHttpRequest();
		xhr.open(method, url);
		xhr.send();
		await settle();
		return xhr as unknown as FakeXhr;
	};

	it("records a finished request", async () => {
		FakeXhr.next = { status: 404 };
		await request("get", "/api/items?session=s3cr3t");
		expect(getNetworkEntries()).toEqual([
			{
				method: "GET",
				url: "https://shop.example.com/api/items?session=[redacted]",
				status: 404,
				durationMs: expect.any(Number),
				timestamp: expect.any(Number),
			},
		]);
	});

	it("names network errors, aborts and timeouts, and removes its listeners", async () => {
		const outcomes = [
			["error", "Network error"],
			["abort", "Request aborted"],
			["timeout", "Request timed out"],
		] as const;
		for (const [fail] of outcomes) {
			FakeXhr.next = { status: 0, fail };
			const xhr = await request("POST", "https://api.example.com/x");
			expect(xhr.listenerCount()).toBe(0);
		}
		expect(getNetworkEntries().map((e) => [e.status, e.error])).toEqual(
			outcomes.map(([, message]) => [0, message]),
		);
	});

	it("skips ignored URLs", async () => {
		internalState.ignoredUrls = ["https://tattle.example.com/"];
		await request("POST", "https://tattle.example.com/api/v1/ingest");
		expect(getNetworkEntries()).toEqual([]);
	});
});
