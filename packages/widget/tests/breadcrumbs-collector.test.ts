import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type ElementLike,
	getBreadcrumbs,
	installBreadcrumbCollector,
	uninstallBreadcrumbCollector,
} from "../src/collectors/breadcrumbs";

// No DOM: window and document are plain EventTargets, history a recorder,
// and each element answers `closest` for the selectors it belongs to.

type FakeElement = ElementLike & { parent?: FakeElement };

const element = (
	tagName: string,
	options: {
		attributes?: Record<string, string>;
		text?: string;
		id?: string;
		/** Selector fragments this element (or an ancestor) matches. */
		inside?: string[];
		interactive?: boolean;
		label?: string;
	} = {},
): FakeElement => {
	const el: FakeElement = {
		tagName: tagName.toUpperCase(),
		id: options.id ?? "",
		textContent: options.text ?? "",
		getAttribute: (name) => options.attributes?.[name] ?? null,
		closest: (selector) => {
			if (options.inside?.some((part) => selector.includes(part))) return el;
			if (options.interactive && selector.includes("button")) return el;
			return null;
		},
		labels: options.label === undefined ? [] : [{ textContent: options.label }],
	};
	return el;
};

/**
 * Node's EventTarget, unlike browsers, does not read `true` as the capture
 * flag when removing a listener: this one does.
 */
class BrowserLikeTarget extends EventTarget {
	override addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	) {
		super.addEventListener(
			type,
			listener,
			typeof options === "boolean" ? { capture: options } : options,
		);
	}
	override removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | EventListenerOptions,
	) {
		super.removeEventListener(
			type,
			listener,
			typeof options === "boolean" ? { capture: options } : options,
		);
	}
}

let win: EventTarget;
let doc: EventTarget & { visibilityState: string };
let loc: { href: string; origin: string };
const rawPush = vi.fn();
const rawReplace = vi.fn();
let hist: {
	pushState: History["pushState"];
	replaceState: History["replaceState"];
};

const navigate = (method: "pushState" | "replaceState", href: string) => {
	loc.href = href;
	hist[method]({}, "", href);
};

const eventOn = (type: string, target: unknown) => {
	const event = new Event(type);
	Object.defineProperty(event, "target", { value: target });
	return event;
};

beforeEach(() => {
	win = new BrowserLikeTarget();
	doc = Object.assign(new BrowserLikeTarget(), { visibilityState: "visible" });
	loc = {
		href: "https://shop.example.com/cart?session=abc",
		origin: "https://shop.example.com",
	};
	rawPush.mockClear();
	rawReplace.mockClear();
	hist = {
		pushState: rawPush as unknown as History["pushState"],
		replaceState: rawReplace as unknown as History["replaceState"],
	};
	vi.stubGlobal("window", win);
	vi.stubGlobal("document", doc);
	vi.stubGlobal("location", loc);
	vi.stubGlobal("history", hist);
	installBreadcrumbCollector();
});

afterEach(() => {
	uninstallBreadcrumbCollector();
	vi.unstubAllGlobals();
});

const steps = () => getBreadcrumbs().map((b) => [b.category, b.message]);

describe("navigation steps", () => {
	it("start with the page, redacted and without its own origin", () => {
		expect(steps()).toEqual([["navigation", "/cart?session=[redacted]"]]);
	});

	it("follow pushState, replaceState, back and hash changes, once per URL", () => {
		navigate("pushState", "https://shop.example.com/checkout");
		navigate("replaceState", "https://shop.example.com/checkout");
		navigate("replaceState", "https://shop.example.com/checkout?step=2");
		loc.href = "https://shop.example.com/cart";
		win.dispatchEvent(new Event("popstate"));
		loc.href = "https://shop.example.com/cart#reviews";
		win.dispatchEvent(new Event("hashchange"));
		loc.href = "https://pay.example.com/3ds?code=123";
		win.dispatchEvent(new Event("popstate"));
		expect(steps().slice(1)).toEqual([
			["navigation", "/checkout"],
			["navigation", "/checkout?step=2"],
			["navigation", "/cart"],
			["navigation", "/cart#reviews"],
			["navigation", "https://pay.example.com/3ds?code=[redacted]"],
		]);
		// The page's own history calls still happen.
		expect(rawPush).toHaveBeenCalledTimes(1);
		expect(rawReplace).toHaveBeenCalledTimes(2);
	});
});

describe("click steps", () => {
	it("describe what was clicked", () => {
		const pay = element("button", {
			text: "Pay now",
			id: "pay",
			interactive: true,
		});
		doc.dispatchEvent(eventOn("click", pay));
		expect(steps().at(-1)).toEqual(["click", "button “Pay now” #pay"]);
	});

	it("skip clicks into fields, but not on submit buttons", () => {
		doc.dispatchEvent(
			eventOn("click", element("input", { attributes: { type: "email" } })),
		);
		doc.dispatchEvent(eventOn("click", element("textarea")));
		doc.dispatchEvent(eventOn("click", element("select")));
		doc.dispatchEvent(
			eventOn(
				"click",
				element("input", {
					attributes: { type: "submit", "aria-label": "Send" },
				}),
			),
		);
		expect(steps().slice(1)).toEqual([["click", "button “Send”"]]);
	});

	it("ignore the widget's own UI and targets that are not elements", () => {
		doc.dispatchEvent(
			eventOn(
				"click",
				element("div", { text: "Send report", inside: ["data-tattle-widget"] }),
			),
		);
		doc.dispatchEvent(eventOn("click", null));
		doc.dispatchEvent(eventOn("click", { nodeName: "#text" }));
		expect(steps()).toHaveLength(1);
	});

	it("never break the page when an element misbehaves", () => {
		const broken = {
			...element("button", { interactive: true }),
			getAttribute: () => {
				throw new Error("detached");
			},
		};
		expect(() => doc.dispatchEvent(eventOn("click", broken))).not.toThrow();
	});
});

describe("input and tab steps", () => {
	it("name the field that changed, never its value or a password", () => {
		doc.dispatchEvent(
			eventOn(
				"change",
				element("input", { attributes: { type: "email" }, label: "Email" }),
			),
		);
		doc.dispatchEvent(
			eventOn(
				"change",
				element("input", {
					attributes: { type: "password" },
					label: "Password",
				}),
			),
		);
		doc.dispatchEvent(eventOn("change", element("div")));
		expect(steps().slice(1)).toEqual([["input", "Changed “Email” (email)"]]);
	});

	it("note leaving the tab and coming back", () => {
		doc.visibilityState = "hidden";
		doc.dispatchEvent(new Event("visibilitychange"));
		doc.visibilityState = "visible";
		doc.dispatchEvent(new Event("visibilitychange"));
		expect(steps().slice(1)).toEqual([
			["app", "Left the tab"],
			["app", "Came back to the tab"],
		]);
	});
});

describe("uninstalling", () => {
	it("restores history and stops listening, unless the page wrapped history again", () => {
		const wrappedPush = hist.pushState;
		installBreadcrumbCollector();
		expect(hist.pushState).toBe(wrappedPush);
		uninstallBreadcrumbCollector();
		expect(hist.pushState).toBe(rawPush);
		expect(hist.replaceState).toBe(rawReplace);
		expect(getBreadcrumbs()).toEqual([]);
		doc.dispatchEvent(
			eventOn("click", element("button", { text: "Late", interactive: true })),
		);
		win.dispatchEvent(new Event("popstate"));
		expect(getBreadcrumbs()).toEqual([]);

		installBreadcrumbCollector();
		const pageWrapper = vi.fn() as unknown as History["pushState"];
		hist.pushState = pageWrapper;
		uninstallBreadcrumbCollector();
		expect(hist.pushState).toBe(pageWrapper);
		expect(hist.replaceState).toBe(rawReplace);
	});
});
