import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getConsoleEntries,
	installConsoleCollector,
	pushConsoleEntry,
	safeStringify,
	uninstallConsoleCollector,
} from "../src/collectors/console";
import { internalState } from "../src/internal";

// Node has Event and EventTarget but none of the DOM's error events or
// elements: small stand-ins are enough for the collector.
class FakeErrorEvent extends Event {
	readonly error: unknown;
	readonly message: string;
	readonly filename: string;
	readonly lineno: number;
	readonly colno: number;
	constructor(init: {
		error?: unknown;
		message?: string;
		filename?: string;
		lineno?: number;
		colno?: number;
	}) {
		super("error");
		this.error = init.error;
		this.message = init.message ?? "";
		this.filename = init.filename ?? "";
		this.lineno = init.lineno ?? 0;
		this.colno = init.colno ?? 0;
	}
}
class FakeRejectionEvent extends Event {
	constructor(readonly reason: unknown) {
		super("unhandledrejection");
	}
}
class FakeElement extends EventTarget {
	constructor(
		readonly tagName: string,
		private readonly attributes: Record<string, string>,
	) {
		super();
	}
	getAttribute(name: string) {
		return this.attributes[name] ?? null;
	}
}

let win: EventTarget;
const originalLog = console.log;
const originalError = console.error;
let printed: unknown[][];

beforeEach(() => {
	printed = [];
	win = new EventTarget();
	vi.stubGlobal("window", win);
	vi.stubGlobal("location", { href: "https://shop.example.com/" });
	vi.stubGlobal("ErrorEvent", FakeErrorEvent);
	vi.stubGlobal("Element", FakeElement);
	// What the page's console prints, without printing it.
	console.log = (...args: unknown[]) => {
		printed.push(args);
	};
	console.error = (...args: unknown[]) => {
		printed.push(args);
	};
	internalState.capturing = 0;
	installConsoleCollector();
});

afterEach(() => {
	uninstallConsoleCollector();
	console.log = originalLog;
	console.error = originalError;
	vi.unstubAllGlobals();
});

const messages = () => getConsoleEntries().map((e) => [e.level, e.message]);

describe("the console collector", () => {
	it("records each call and still prints it", () => {
		console.log("cart", { items: 2, password: "hunter2" }, 3, null);
		expect(messages()).toEqual([
			["log", 'cart {"items":2,"password":"[redacted]"} 3 null'],
		]);
		expect(printed).toEqual([
			["cart", { items: 2, password: "hunter2" }, 3, null],
		]);
	});

	it("keeps the stack of a logged error, scrubbed", () => {
		const error = new Error(
			"Request to https://api.example.com/?token=abc failed",
		);
		console.error("Oops", error);
		const [entry] = getConsoleEntries();
		expect(entry?.level).toBe("error");
		expect(entry?.message).toBe(
			"Oops Error: Request to https://api.example.com/?token=[redacted] failed",
		);
		expect(entry?.stack).toContain("token=[redacted]");
		expect(entry?.stack).not.toContain("token=abc");
	});

	it("ignores html-to-image noise only while a screenshot is taken", () => {
		internalState.capturing = 1;
		console.error(
			"Error loading remote stylesheet https://cdn.example.com/a.css",
		);
		console.error("Real problem");
		internalState.capturing = 0;
		console.error(
			"Error loading remote stylesheet https://cdn.example.com/a.css",
		);
		expect(messages().map(([, m]) => m)).toEqual([
			"Real problem",
			"Error loading remote stylesheet https://cdn.example.com/a.css",
		]);
	});

	it("does not record what logging an argument logs itself", () => {
		const loud = new Proxy(
			{ a: 1 },
			{
				ownKeys(target) {
					console.log("inner");
					return Reflect.ownKeys(target);
				},
			},
		);
		console.log(loud);
		expect(messages()).toHaveLength(1);
	});

	it("never breaks the page's console, whatever it logs", () => {
		const hostile = new Proxy(
			{},
			{
				ownKeys() {
					throw new Error("no keys for you");
				},
			},
		);
		expect(() => console.log(hostile)).not.toThrow();
		expect(printed).toHaveLength(1);
	});

	it("keeps the last 200 entries and truncates long messages", () => {
		for (let i = 0; i < 205; i++) console.log(`line ${i}`);
		const entries = getConsoleEntries();
		expect(entries).toHaveLength(200);
		expect(entries[0]?.message).toBe("line 5");
		console.log("x".repeat(5000));
		expect(getConsoleEntries().at(-1)?.message).toMatch(/…\[truncated\]$/);
	});

	it("records uncaught errors with their redacted file", () => {
		win.dispatchEvent(
			new FakeErrorEvent({
				error: new TypeError("x is undefined"),
				filename: "https://shop.example.com/app.js?sig=secret",
				lineno: 10,
				colno: 4,
			}),
		);
		win.dispatchEvent(new FakeErrorEvent({ message: "" }));
		expect(messages()).toEqual([
			[
				"error",
				"Uncaught TypeError: x is undefined (https://shop.example.com/app.js?sig=[redacted]:10:4)",
			],
			["error", "Uncaught Script error"],
		]);
	});

	it("records resources that failed to load", () => {
		const img = new FakeElement("IMG", {
			src: "https://cdn.example.com/a.png?X-Amz-Signature=abc",
		});
		const event = new Event("error");
		Object.defineProperty(event, "target", { value: img });
		win.dispatchEvent(event);
		expect(messages()).toEqual([
			[
				"error",
				"Failed to load resource: <img> https://cdn.example.com/a.png?X-Amz-Signature=[redacted]",
			],
		]);
	});

	it("records unhandled rejections", () => {
		win.dispatchEvent(new FakeRejectionEvent(new Error("boom")));
		win.dispatchEvent(new FakeRejectionEvent({ code: 42 }));
		expect(messages()).toEqual([
			["error", "Unhandled promise rejection: Error: boom"],
			["error", 'Unhandled promise rejection: {"code":42}'],
		]);
	});

	it("restores the console and stops listening, unless the page wrapped it again", () => {
		const ours = console.log;
		installConsoleCollector();
		expect(console.log).toBe(ours);
		uninstallConsoleCollector();
		expect(getConsoleEntries()).toEqual([]);
		console.log("after");
		win.dispatchEvent(new FakeRejectionEvent(new Error("late")));
		expect(getConsoleEntries()).toEqual([]);

		installConsoleCollector();
		const pageWrapper = () => {};
		console.log = pageWrapper;
		uninstallConsoleCollector();
		expect(console.log).toBe(pageWrapper);
	});
});

describe("safeStringify", () => {
	it("describes values JSON cannot hold", () => {
		const text = safeStringify({
			n: Number.NaN,
			big: 10n,
			sym: Symbol("s"),
			fn: function named() {},
			anon: () => {},
			undef: undefined,
			date: new Date(0),
			bad: new Date(Number.NaN),
			re: /a+/g,
			map: new Map([["k", 1]]),
			set: new Set([1, 2]),
			err: new RangeError("too far"),
		});
		expect(JSON.parse(text)).toEqual({
			n: "NaN",
			big: "10n",
			sym: "Symbol(s)",
			fn: "[Function named]",
			anon: "[Function anon]",
			undef: "[undefined]",
			date: "1970-01-01T00:00:00.000Z",
			bad: "Invalid Date",
			re: "/a+/g",
			map: { k: 1 },
			set: [1, 2],
			err: "RangeError: too far",
		});
	});

	it("limits depth, keys, array items and strings, and marks cycles", () => {
		const cyclic: Record<string, unknown> = { name: "loop" };
		cyclic.self = cyclic;
		const text = safeStringify({
			deep: { a: { b: { c: { d: 1 } } } },
			list: Array.from({ length: 105 }, (_, i) => i),
			wide: Object.fromEntries(
				Array.from({ length: 120 }, (_, i) => [`k${i}`, i]),
			),
			long: "y".repeat(1200),
			cyclic,
			shared: [cyclic, cyclic],
		});
		const parsed = JSON.parse(text);
		expect(parsed.deep).toEqual({ a: { b: { c: "[Object]" } } });
		expect(parsed.list).toHaveLength(101);
		expect(parsed.list.at(-1)).toBe("…5 more");
		expect(Object.keys(parsed.wide)).toHaveLength(101);
		expect(parsed.wide["…"]).toBe("more keys");
		expect(parsed.long).toMatch(/^y{1000}…\[truncated\]$/);
		expect(parsed.cyclic).toEqual({ name: "loop", self: "[Circular]" });
		// The same object twice in a row is not a cycle.
		expect(parsed.shared[0]).toEqual({ name: "loop", self: "[Circular]" });
		expect(parsed.shared[1]).toEqual({ name: "loop", self: "[Circular]" });
	});

	it("redacts credential keys, whatever their case", () => {
		expect(
			JSON.parse(
				safeStringify({
					Cookie: "a=b",
					API_KEY: "k",
					apiKey: "k",
					auth: "x",
					author: "Ada",
					jwt: "e",
				}),
			),
		).toEqual({
			Cookie: "[redacted]",
			API_KEY: "[redacted]",
			apiKey: "[redacted]",
			auth: "[redacted]",
			author: "Ada",
			jwt: "[redacted]",
		});
	});

	it("falls back to String() and then to a placeholder", () => {
		expect(safeStringify(undefined)).toBe('"[undefined]"');
		const unprintable = {
			toString() {
				throw new Error("no");
			},
		};
		expect(typeof safeStringify(unprintable)).toBe("string");
	});
});

describe("pushConsoleEntry", () => {
	it("scrubs a stack too", () => {
		pushConsoleEntry("warn", "careful", "at https://x.example/?secret=1");
		expect(getConsoleEntries().at(-1)).toMatchObject({
			level: "warn",
			stack: "at https://x.example/?secret=[redacted]",
		});
	});
});
