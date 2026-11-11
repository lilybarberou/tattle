import { internalState, isInternalInit } from "../internal";
import { redactUrl } from "../redact";
import type { NetworkEntry } from "../types";

const MAX_ENTRIES = 100;
/** Static assets html-to-image may fetch while capturing a screenshot. */
const CAPTURE_ASSET =
	/\.(css|woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|svg|ico|bmp)(?:[?#]|$)|fonts\.(googleapis|gstatic)\.com/i;

const buffer: NetworkEntry[] = [];
let installed = false;
let rawFetch: typeof fetch | undefined;
let originalFetch: typeof fetch | undefined;
let wrappedFetch: typeof fetch | undefined;
let originalOpen: XMLHttpRequest["open"] | undefined;
let originalSend: XMLHttpRequest["send"] | undefined;
let wrappedOpen: XMLHttpRequest["open"] | undefined;
let wrappedSend: XMLHttpRequest["send"] | undefined;

interface XhrMeta {
	method: string;
	url: string;
}
const xhrMeta = new WeakMap<XMLHttpRequest, XhrMeta>();

function absoluteUrl(url: string): string {
	try {
		return new URL(url, location.href).href;
	} catch {
		return url;
	}
}

function shouldIgnore(method: string, url: string): boolean {
	const abs = absoluteUrl(url);
	if (internalState.ignoredUrls.some((prefix) => abs.startsWith(prefix)))
		return true;
	return (
		internalState.capturing > 0 && method === "GET" && CAPTURE_ASSET.test(abs)
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
	return originalFetch ?? fetch.bind(window);
}

function installFetch(): void {
	if (typeof window.fetch !== "function") return;
	const original = window.fetch;
	rawFetch = original;
	originalFetch = original.bind(window);
	wrappedFetch = function (
		this: unknown,
		input: RequestInfo | URL,
		init?: RequestInit,
	) {
		let method = "GET";
		let url = "";
		try {
			if (typeof input === "string") url = input;
			else if (input instanceof URL) url = input.href;
			else if (input && typeof input === "object" && "url" in input) {
				url = input.url;
				method = input.method || method;
			}
			if (init?.method) method = init.method;
			method = method.toUpperCase();
		} catch {
			// ignore
		}
		const promise = original.call(
			this === undefined ? window : this,
			input,
			init,
		);
		if (isInternalInit(init) || shouldIgnore(method, url)) return promise;
		const timestamp = Date.now();
		const start = performance.now();
		promise.then(
			(response) => {
				push({
					method,
					url: redactUrl(url),
					status: response.status,
					durationMs: Math.round(performance.now() - start),
					timestamp,
				});
			},
			(error: unknown) => {
				push({
					method,
					url: redactUrl(url),
					status: 0,
					durationMs: Math.round(performance.now() - start),
					timestamp,
					error: errorMessage(error),
				});
			},
		);
		return promise;
	} as typeof fetch;
	window.fetch = wrappedFetch;
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
		try {
			xhrMeta.set(this, {
				method: String(method || "GET").toUpperCase(),
				url: String(url),
			});
		} catch {
			// ignore
		}
		return (open as (...args: unknown[]) => void).call(
			this,
			method,
			url,
			...rest,
		);
	} as XMLHttpRequest["open"];

	proto.send = function (
		this: XMLHttpRequest,
		body?: Document | XMLHttpRequestBodyInit | null,
	) {
		const meta = xhrMeta.get(this);
		if (meta && !shouldIgnore(meta.method, meta.url)) {
			const timestamp = Date.now();
			const start = performance.now();
			let failure: string | undefined;
			const onFail = (event: Event) => {
				failure =
					event.type === "abort"
						? "Request aborted"
						: event.type === "timeout"
							? "Request timed out"
							: "Network error";
			};

			const onEnd = () => {
				this.removeEventListener("error", onFail);
				this.removeEventListener("abort", onFail);
				this.removeEventListener("timeout", onFail);
				this.removeEventListener("loadend", onEnd);
				const entry: NetworkEntry = {
					method: meta.method,
					url: redactUrl(meta.url),
					status: failure ? 0 : this.status,
					durationMs: Math.round(performance.now() - start),
					timestamp,
				};
				if (failure) entry.error = failure;
				push(entry);
			};
			this.addEventListener("error", onFail);
			this.addEventListener("abort", onFail);
			this.addEventListener("timeout", onFail);
			this.addEventListener("loadend", onEnd);
		}
		return send.call(this, body);
	};
	wrappedOpen = proto.open;
	wrappedSend = proto.send;
}

export function installNetworkCollector(): void {
	if (installed || typeof window === "undefined") return;
	installed = true;
	installFetch();
	installXhr();
}

export function uninstallNetworkCollector(): void {
	if (!installed) return;
	installed = false;
	// Only restore what nobody re-wrapped in the meantime.
	if (rawFetch && window.fetch === wrappedFetch) window.fetch = rawFetch;
	const proto = XMLHttpRequest.prototype;
	if (originalOpen && proto.open === wrappedOpen) proto.open = originalOpen;
	if (originalSend && proto.send === wrappedSend) proto.send = originalSend;
	rawFetch = originalFetch = wrappedFetch = undefined;
	originalOpen = wrappedOpen = undefined;
	originalSend = wrappedSend = undefined;
	buffer.length = 0;
}

export function getNetworkEntries(): NetworkEntry[] {
	return buffer.slice();
}
