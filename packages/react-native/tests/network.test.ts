import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getNetworkEntries,
	installNetworkCollector,
	uninstallNetworkCollector,
} from "../src/collectors/network";
import { state } from "../src/state";

type Listener = (event: { type: string }) => void;

/** A minimal XMLHttpRequest that finishes when `finish` is called. */
class FakeXhr {
	static last: FakeXhr | null = null;
	status = 0;
	listeners: Record<string, Listener[]> = {};
	open(_method: string, _url: string) {
		FakeXhr.last = this;
	}
	send() {}
	addEventListener(type: string, listener: Listener) {
		this.listeners[type] = [...(this.listeners[type] ?? []), listener];
	}
	removeEventListener(type: string, listener: Listener) {
		this.listeners[type] = (this.listeners[type] ?? []).filter(
			(l) => l !== listener,
		);
	}
	finish(status: number, failure?: string) {
		this.status = status;
		if (failure)
			for (const l of this.listeners[failure] ?? []) l({ type: failure });
		for (const l of this.listeners.loadend ?? []) l({ type: "loadend" });
	}
}

/** React Native's fetch: built on XMLHttpRequest, opened synchronously. */
function xhrFetch(input: string, init?: { method?: string }) {
	const xhr = new XMLHttpRequest();
	xhr.open(init?.method ?? "GET", input);
	xhr.send();
	return new Promise<Response>((resolve) => {
		queueMicrotask(() => {
			(xhr as unknown as FakeXhr).finish(200);
			resolve(new Response(null, { status: 200 }));
		});
	});
}

beforeEach(() => {
	vi.stubGlobal("XMLHttpRequest", FakeXhr);
	vi.stubGlobal("fetch", xhrFetch);
	installNetworkCollector();
});

afterEach(() => {
	uninstallNetworkCollector();
	vi.unstubAllGlobals();
	state.ignoredUrls.length = 0;
});

describe("network collector", () => {
	it("records a fetch once, although it runs on XMLHttpRequest", async () => {
		await fetch("https://api.example.com/cart?session=abc", { method: "post" });
		expect(getNetworkEntries()).toEqual([
			expect.objectContaining({
				method: "POST",
				url: "https://api.example.com/cart?session=[redacted]",
				status: 200,
			}),
		]);
	});

	it("records XMLHttpRequest calls, failures included", () => {
		const xhr = new XMLHttpRequest();
		xhr.open("GET", "https://api.example.com/orders");
		xhr.send();
		(xhr as unknown as FakeXhr).finish(0, "timeout");
		expect(getNetworkEntries()).toEqual([
			expect.objectContaining({
				method: "GET",
				url: "https://api.example.com/orders",
				status: 0,
				error: "Request timed out",
			}),
		]);
	});

	it("skips the SDK's own requests and the dev tools", async () => {
		state.ignoredUrls.push("https://tattle.example.com/api/v1/ingest");
		await fetch("https://tattle.example.com/api/v1/ingest", { method: "POST" });
		await fetch("http://localhost:8081/symbolicate", { method: "POST" });
		expect(getNetworkEntries()).toEqual([]);
	});
});
