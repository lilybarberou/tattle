import { internalState } from "../internal";
import { redactUrl } from "../redact";
import type { ConsoleEntry, ConsoleLevel } from "../types";

const MAX_ENTRIES = 200;
const MAX_DEPTH = 4;
const MAX_STRING = 1000;
const MAX_MESSAGE = 4000;
const MAX_KEYS = 100;
const LEVELS: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];

/** Messages html-to-image prints while capturing; not useful in reports. */
const CAPTURE_NOISE =
	/^(Failed to fetch resource|Error (inserting rule from remote css|loading remote css|loading remote stylesheet|inlining remote css file|while reading CSS rules))/;

const buffer: ConsoleEntry[] = [];
const originals: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> =
	{};
const wrappers: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> =
	{};
let installed = false;
let recording = false;

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

function describeError(error: Error): string {
	return `${error.name || "Error"}: ${error.message}`;
}

function describeNode(node: Node): string {
	if (node instanceof Element) {
		const id = node.id ? `#${node.id}` : "";
		const cls =
			typeof node.className === "string" && node.className.trim()
				? `.${node.className.trim().split(/\s+/).join(".")}`
				: "";
		return `<${node.tagName.toLowerCase()}${id}${cls}>`;
	}
	return `[${node.nodeName}]`;
}

/** Circular-safe JSON stringify with depth, key and string limits. */
export function safeStringify(value: unknown): string {
	const seen = new WeakSet<object>();
	const walk = (val: unknown, depth: number): unknown => {
		if (typeof val === "string") return truncate(val, MAX_STRING);
		if (typeof val === "number")
			return Number.isFinite(val) ? val : String(val);
		if (typeof val === "bigint") return `${val}n`;
		if (typeof val === "symbol") return val.toString();
		if (typeof val === "function")
			return `[Function ${val.name || "anonymous"}]`;
		if (val === undefined) return "[undefined]";
		if (val === null || typeof val !== "object") return val;
		if (val instanceof Error) return describeError(val);
		if (val instanceof Date)
			return Number.isNaN(val.getTime()) ? "Invalid Date" : val.toISOString();
		if (val instanceof RegExp) return val.toString();
		if (typeof Node !== "undefined" && val instanceof Node)
			return describeNode(val);
		if (typeof Window !== "undefined" && val instanceof Window)
			return "[Window]";
		if (seen.has(val)) return "[Circular]";
		if (depth >= MAX_DEPTH) return Array.isArray(val) ? "[Array]" : "[Object]";
		seen.add(val);
		try {
			if (Array.isArray(val)) {
				const out = val.slice(0, MAX_KEYS).map((v) => walk(v, depth + 1));
				if (val.length > MAX_KEYS) out.push(`…${val.length - MAX_KEYS} more`);
				return out;
			}
			if (val instanceof Map) {
				return walk(
					Object.fromEntries(Array.from(val.entries()).slice(0, MAX_KEYS)),
					depth,
				);
			}
			if (val instanceof Set) return walk(Array.from(val), depth);
			const out: Record<string, unknown> = {};
			let count = 0;
			for (const key in val) {
				if (!Object.hasOwn(val, key)) continue;
				if (count++ >= MAX_KEYS) {
					out["…"] = "more keys";
					break;
				}
				try {
					out[key] = walk((val as Record<string, unknown>)[key], depth + 1);
				} catch {
					out[key] = "[Unreadable]";
				}
			}
			return out;
		} finally {
			seen.delete(val);
		}
	};
	try {
		return JSON.stringify(walk(value, 0)) ?? String(value);
	} catch {
		try {
			return String(value);
		} catch {
			return "[Unserializable]";
		}
	}
}

function serializeArg(arg: unknown): string {
	if (typeof arg === "string") return arg;
	if (arg instanceof Error) return describeError(arg);
	if (arg === null || (typeof arg !== "object" && typeof arg !== "function"))
		return String(arg);
	return safeStringify(arg);
}

export function pushConsoleEntry(
	level: ConsoleLevel,
	message: string,
	stack?: string,
): void {
	if (internalState.capturing > 0 && CAPTURE_NOISE.test(message)) return;
	const entry: ConsoleEntry = {
		level,
		message: truncate(message, MAX_MESSAGE),
		timestamp: Date.now(),
	};
	if (stack) entry.stack = truncate(stack, MAX_MESSAGE);
	buffer.push(entry);
	if (buffer.length > MAX_ENTRIES)
		buffer.splice(0, buffer.length - MAX_ENTRIES);
}

function record(level: ConsoleLevel, args: unknown[]): void {
	if (recording) return; // re-entrancy guard (e.g. a getter that logs)
	recording = true;
	try {
		const message = args.map(serializeArg).join(" ");
		const error = args.find((a): a is Error => a instanceof Error);
		pushConsoleEntry(level, message, error?.stack);
	} catch {
		// never break the host's console
	} finally {
		recording = false;
	}
}

function onError(event: Event): void {
	if (event instanceof ErrorEvent) {
		const err: unknown = event.error;
		const message =
			err instanceof Error
				? describeError(err)
				: event.message || "Script error";
		const where = event.filename
			? ` (${redactUrl(event.filename)}:${event.lineno}:${event.colno})`
			: "";
		pushConsoleEntry(
			"error",
			`Uncaught ${message}${where}`,
			err instanceof Error ? err.stack : undefined,
		);
		return;
	}
	// Resource loading errors (capture phase): <img>, <script>, <link>…
	const target = event.target;
	if (
		target instanceof Element &&
		target !== (event.currentTarget as unknown)
	) {
		const src = target.getAttribute("src") || target.getAttribute("href") || "";
		pushConsoleEntry(
			"error",
			`Failed to load resource: <${target.tagName.toLowerCase()}> ${redactUrl(src)}`,
		);
	}
}

function onRejection(event: PromiseRejectionEvent): void {
	const reason: unknown = event.reason;
	const message =
		reason instanceof Error ? describeError(reason) : serializeArg(reason);
	pushConsoleEntry(
		"error",
		`Unhandled promise rejection: ${message}`,
		reason instanceof Error ? reason.stack : undefined,
	);
}

export function installConsoleCollector(): void {
	if (
		installed ||
		typeof window === "undefined" ||
		typeof console === "undefined"
	)
		return;
	installed = true;
	for (const level of LEVELS) {
		const original = console[level] as
			| ((...args: unknown[]) => void)
			| undefined;
		if (typeof original !== "function") continue;
		originals[level] = original;
		const wrapper = function (this: unknown, ...args: unknown[]) {
			record(level, args);
			return original.apply(this ?? console, args);
		};
		wrappers[level] = wrapper;
		console[level] = wrapper;
	}
	window.addEventListener("error", onError, true);
	window.addEventListener("unhandledrejection", onRejection);
}

export function uninstallConsoleCollector(): void {
	if (!installed) return;
	installed = false;
	for (const level of LEVELS) {
		const original = originals[level];
		// Only restore if nobody wrapped us in the meantime.
		if (original && console[level] === wrappers[level])
			console[level] = original;
		delete originals[level];
		delete wrappers[level];
	}
	window.removeEventListener("error", onError, true);
	window.removeEventListener("unhandledrejection", onRejection);
	buffer.length = 0;
}

export function getConsoleEntries(): ConsoleEntry[] {
	return buffer.slice();
}
