import { redactUrl } from "../redact";
import { state } from "../state";
import type { NetworkEntry } from "../types";

const MAX_ENTRIES = 100;
/** Requests the React Native dev tools make to Metro while showing errors. */
const DEV_TOOLING = /\/(symbolicate|open-stack-frame)(?:[?#]|$)/;

const buffer: NetworkEntry[] = [];
let installed = false;
let originalFetch: typeof fetch | undefined;
let wrappedFetch: typeof fetch | undefined;
let originalOpen: XMLHttpRequest["open"] | undefined;
let originalSend: XMLHttpRequest["send"] | undefined;
let wrappedOpen: XMLHttpRequest["open"] | undefined;
let wrappedSend: XMLHttpRequest["send"] | undefined;
/**
 * React Native's fetch is built on XMLHttpRequest. While a wrapped fetch call
 * runs (synchronously), XHRs opened are its own: they are not recorded twice.
 */
let insideFetch = 0;

interface XhrMeta {
	method: string;
	url: string;
}
const xhrMeta = new WeakMap<XMLHttpRequest, XhrMeta>();

const clock = (globalThis as { performance?: { now(): number } }).performance;
const now = () =>
	clock && typeof clock.now === "function" ? clock.now() : Date.now();

/** The parts of XMLHttpRequest the collector uses, whatever the typings. */
interface Xhr {
	status: number;
	addEventListener(
		type: string,
		listener: (event: { type: string }) => void,
	): void;
	removeEventListener(
		type: string,
		listener: (event: { type: string }) => void,
	): void;
}

function shouldIgnore(url: string): boolean {
	return (
		state.ignoredUrls.some((prefix) => url.startsWith(prefix)) ||
		DEV_TOOLING.test(url)
	);
}

function push(entry: NetworkEntry): void {
	buffer.push(entry);
	if (buffer.length > MAX_ENTRIES)
		buffer.splice(0, buffer.length - MAX_ENTRIES);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	return String(error);
}

/** The untouched `fetch`, used by the SDK for its own requests. */
export function getOriginalFetch(): typeof fetch {
	return originalFetch ?? fetch;
}

function describeRequest(
	input: unknown,
	init?: RequestInit,
): { method: string; url: string } {
	let method = "GET";
	let url = "";
	try {
		if (typeof input === "string") url = input;
		else if (input && typeof input === "object") {
			if ("href" in input && typeof input.href === "string") url = input.href;
			else if ("url" in input && typeof input.url === "string") {
				url = input.url;
				if ("method" in input && typeof input.method === "string")
					method = input.method;
			}
		}
		if (init?.method) method = init.method;
	} catch {
		// ignore
	}
	return { method: method.toUpperCase(), url };
}

function installFetch(): void {
	if (typeof globalThis.fetch !== "function") return;
	const original = globalThis.fetch;
	originalFetch = original;
	wrappedFetch = function (
		this: unknown,
		input: Parameters<typeof fetch>[0],
		init?: RequestInit,
	) {
		const { method, url } = describeRequest(input, init);
		const timestamp = Date.now();
		const start = now();
		let promise: Promise<Response>;
		insideFetch++;
		try {
			promise = original.call(this ?? globalThis, input, init);
		} finally {
			insideFetch--;
		}
		if (shouldIgnore(url)) return promise;
		promise.then(
			(response) =>
				push({
					method,
					url: redactUrl(url),
					status: response.status,
					durationMs: Math.round(now() - start),
					timestamp,
				}),
			(error: unknown) =>
				push({
					method,
					url: redactUrl(url),
					status: 0,
					durationMs: Math.round(now() - start),
					timestamp,
					error: errorMessage(error),
				}),
		);
		return promise;
	} as typeof fetch;
	globalThis.fetch = wrappedFetch;
}

function installXhr(): void {
	if (typeof XMLHttpRequest === "undefined") return;
	const proto = XMLHttpRequest.prototype;
	originalOpen = proto.open;
	originalSend = proto.send;
	const open = originalOpen;
	const send = originalSend;

	proto.open = function (
		this: XMLHttpRequest,
		method: string,
		url: string | URL,
		...rest: unknown[]
	) {
		if (insideFetch === 0) {
			try {
				xhrMeta.set(this, {
					method: String(method || "GET").toUpperCase(),
					url: String(url),
				});
			} catch {
				// ignore
			}
		} else {
			xhrMeta.delete(this);
		}
		return (open as (...args: unknown[]) => void).call(
			this,
			method,
			url,
			...rest,
		);
	} as XMLHttpRequest["open"];

	proto.send = function (this: XMLHttpRequest, body?: unknown) {
		const meta = xhrMeta.get(this);
		const xhr = this as unknown as Xhr;
		if (meta && !shouldIgnore(meta.url)) {
			const timestamp = Date.now();
			const start = now();
			let failure: string | undefined;
			const onFail = (event: { type: string }) => {
				failure =
					event.type === "abort"
						? "Request aborted"
						: event.type === "timeout"
							? "Request timed out"
							: "Network error";
			};
			const onEnd = () => {
				xhr.removeEventListener("error", onFail);
				xhr.removeEventListener("abort", onFail);
				xhr.removeEventListener("timeout", onFail);
				xhr.removeEventListener("loadend", onEnd);
				const entry: NetworkEntry = {
					method: meta.method,
					url: redactUrl(meta.url),
					status: failure ? 0 : xhr.status,
					durationMs: Math.round(now() - start),
					timestamp,
				};
				if (failure) entry.error = failure;
				push(entry);
			};
			xhr.addEventListener("error", onFail);
			xhr.addEventListener("abort", onFail);
			xhr.addEventListener("timeout", onFail);
			xhr.addEventListener("loadend", onEnd);
		}
		return (send as (body?: unknown) => void).call(this, body);
	};
	wrappedOpen = proto.open;
	wrappedSend = proto.send;
}

export function installNetworkCollector(): void {
	if (installed) return;
	installed = true;
	installFetch();
	installXhr();
}

export function uninstallNetworkCollector(): void {
	if (!installed) return;
	installed = false;
	// Only restore what nobody re-wrapped in the meantime.
	if (originalFetch && globalThis.fetch === wrappedFetch)
		globalThis.fetch = originalFetch;
	if (typeof XMLHttpRequest !== "undefined") {
		const proto = XMLHttpRequest.prototype;
		if (originalOpen && proto.open === wrappedOpen) proto.open = originalOpen;
		if (originalSend && proto.send === wrappedSend) proto.send = originalSend;
	}
	originalFetch = wrappedFetch = undefined;
	originalOpen = wrappedOpen = undefined;
	originalSend = wrappedSend = undefined;
	buffer.length = 0;
}

export function getNetworkEntries(): NetworkEntry[] {
	return buffer.slice();
}
