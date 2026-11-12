import type { ConsoleEntry, ConsoleLevel } from "../types";

const MAX_ENTRIES = 200;
const MAX_DEPTH = 4;
const MAX_STRING = 1000;
const MAX_MESSAGE = 4000;
const MAX_KEYS = 100;
const LEVELS: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
	getGlobalHandler(): GlobalHandler;
	setGlobalHandler(handler: GlobalHandler): void;
}
interface HermesLike {
	enablePromiseRejectionTracker?: (options: {
		allRejections: boolean;
		onUnhandled: (id: number, reason: unknown) => void;
	}) => void;
}

const buffer: ConsoleEntry[] = [];
const originals: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> =
	{};
const wrappers: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> =
	{};
let installed = false;
let recording = false;
let previousHandler: GlobalHandler | undefined;
let ourHandler: GlobalHandler | undefined;
let rejectionsTracked = false;

const globals = globalThis as typeof globalThis & {
	ErrorUtils?: ErrorUtilsLike;
	HermesInternal?: HermesLike;
	__DEV__?: boolean;
};

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

function describeError(error: Error): string {
	return `${error.name || "Error"}: ${error.message}`;
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

function recordError(prefix: string, error: unknown): void {
	const message =
		error instanceof Error ? describeError(error) : serializeArg(error);
	pushConsoleEntry(
		"error",
		`${prefix}${message}`,
		error instanceof Error ? error.stack : undefined,
	);
}

function installErrorHandler(): void {
	const errorUtils = globals.ErrorUtils;
	if (!errorUtils) return;
	previousHandler = errorUtils.getGlobalHandler();
	ourHandler = (error, isFatal) => {
		recordError(isFatal ? "Fatal: " : "Uncaught ", error);
		previousHandler?.(error, isFatal);
	};
	errorUtils.setGlobalHandler(ourHandler);
}

/**
 * In development React Native already reports unhandled rejections with
 * console.warn, which the console wrapper records. Release builds track
 * nothing, so the SDK does it there (Hermes only).
 */
function trackRejections(): void {
	if (rejectionsTracked || globals.__DEV__ !== false) return;
	const enable = globals.HermesInternal?.enablePromiseRejectionTracker;
	if (typeof enable !== "function") return;
	try {
		enable({
			allRejections: true,
			onUnhandled: (_id, reason) =>
				recordError("Unhandled promise rejection: ", reason),
		});
		rejectionsTracked = true;
	} catch {
		// not available on this engine
	}
}

export function installConsoleCollector(): void {
	if (installed || typeof console === "undefined") return;
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
	installErrorHandler();
	trackRejections();
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
	const errorUtils = globals.ErrorUtils;
	if (
		errorUtils &&
		previousHandler &&
		errorUtils.getGlobalHandler() === ourHandler
	)
		errorUtils.setGlobalHandler(previousHandler);
	previousHandler = ourHandler = undefined;
	buffer.length = 0;
}

export function getConsoleEntries(): ConsoleEntry[] {
	return buffer.slice();
}
