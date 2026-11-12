import { redactUrl } from "../redact";
import type { Breadcrumb, BreadcrumbInput } from "../types";

const MAX_ENTRIES = 50;
const MAX_MESSAGE = 300;
const MAX_CATEGORY = 50;
const MAX_DATA_KEYS = 10;
const MAX_DATA_STRING = 200;
const MAX_NAME = 40;
/** Inside these, clicks are described by their element only, never by text. */
const PRIVATE = "[data-tattle-mask], input[autocomplete^='cc-']";
const WIDGET = "[data-tattle-widget]";
/** What a click lands on, from the most to the least specific. */
const INTERACTIVE =
	"a, button, summary, label, select, textarea, input, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=radio], [role=switch], [role=option], [onclick]";

const buffer: Breadcrumb[] = [];
let installed = false;
let lastUrl = "";
let rawPushState: History["pushState"] | undefined;
let rawReplaceState: History["replaceState"] | undefined;
let wrappedPushState: History["pushState"] | undefined;
let wrappedReplaceState: History["replaceState"] | undefined;

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function squash(value: string | null | undefined): string {
	return (value ?? "").replace(/\s+/g, " ").trim();
}

function cleanData(
	data: unknown,
): Record<string, string | number | boolean | null> | undefined {
	if (!data || typeof data !== "object" || Array.isArray(data))
		return undefined;
	const out: Record<string, string | number | boolean | null> = {};
	for (const [key, value] of Object.entries(data)) {
		if (Object.keys(out).length >= MAX_DATA_KEYS) break;
		const name = key.slice(0, 100);
		if (typeof value === "string") out[name] = truncate(value, MAX_DATA_STRING);
		else if (typeof value === "number" && Number.isFinite(value))
			out[name] = value;
		else if (typeof value === "boolean" || value === null) out[name] = value;
	}
	return Object.keys(out).length ? out : undefined;
}

export function pushBreadcrumb(
	category: string,
	message: string,
	data?: Breadcrumb["data"],
): void {
	const text = squash(message);
	if (!text) return;
	const entry: Breadcrumb = {
		category: truncate(squash(category) || "custom", MAX_CATEGORY),
		message: truncate(text, MAX_MESSAGE),
		timestamp: Date.now(),
	};
	const clean = cleanData(data);
	if (clean) entry.data = clean;
	buffer.push(entry);
	if (buffer.length > MAX_ENTRIES)
		buffer.splice(0, buffer.length - MAX_ENTRIES);
}

/** A step the app adds itself, e.g. "Applied coupon" or "Opened cart". */
export function addBreadcrumb(input: BreadcrumbInput): void {
	if (!input || typeof input.message !== "string") return;
	pushBreadcrumb(
		typeof input.category === "string" ? input.category : "custom",
		input.message,
		input.data as Breadcrumb["data"],
	);
}

/** The minimal Element surface used here, so tests can pass plain objects. */
export interface ElementLike {
	tagName: string;
	id?: string;
	textContent: string | null;
	getAttribute(name: string): string | null;
	closest(selector: string): ElementLike | null;
	labels?: ArrayLike<{ textContent: string | null }> | null;
	ownerDocument?: {
		getElementById(id: string): { textContent: string | null } | null;
	} | null;
}

const isField = (tag: string) =>
	tag === "input" || tag === "select" || tag === "textarea";

function role(el: ElementLike): string {
	const explicit = el.getAttribute("role");
	if (explicit) return explicit;
	const tag = el.tagName.toLowerCase();
	if (tag === "a") return el.getAttribute("href") !== null ? "link" : "a";
	if (tag === "input") {
		const type = (el.getAttribute("type") || "text").toLowerCase();
		if (["submit", "button", "reset", "image"].includes(type)) return "button";
		if (type === "checkbox" || type === "radio") return type;
		return "field";
	}
	if (tag === "select" || tag === "textarea") return "field";
	return tag;
}

/**
 * The accessible name, or the field's label: never the value of a field, and
 * never visible text inside an element marked private.
 */
function accessibleName(el: ElementLike): string {
	const label = squash(el.getAttribute("aria-label"));
	if (label) return label;
	const labelledBy = el.getAttribute("aria-labelledby");
	if (labelledBy && el.ownerDocument) {
		const text = squash(
			labelledBy
				.split(/\s+/)
				.map((id) => el.ownerDocument?.getElementById(id)?.textContent ?? "")
				.join(" "),
		);
		if (text) return text;
	}
	const tag = el.tagName.toLowerCase();
	if (isField(tag)) {
		const fromLabel = squash(el.labels?.[0]?.textContent);
		if (fromLabel) return fromLabel;
		return (
			squash(el.getAttribute("placeholder")) ||
			squash(el.getAttribute("name")) ||
			squash(el.getAttribute("title"))
		);
	}
	const title =
		squash(el.getAttribute("title")) || squash(el.getAttribute("alt"));
	if (title) return title;
	if (el.closest(PRIVATE)) return "";
	return squash(el.textContent);
}

/** A short description such as `button “Pay now” #pay`. */
export function describeElement(el: ElementLike): string {
	const name = truncate(accessibleName(el), MAX_NAME);
	const id = el.id && el.id.length <= MAX_NAME ? `#${el.id}` : "";
	return [role(el), name ? `“${name}”` : "", id].filter(Boolean).join(" ");
}

/** "Changed “Email” (email)": the field's label and type, never its value. */
export function describeField(el: ElementLike): string | null {
	const tag = el.tagName.toLowerCase();
	if (!isField(tag)) return null;
	const type =
		tag === "input"
			? (el.getAttribute("type") || "text").toLowerCase()
			: tag === "select"
				? "select"
				: "textarea";
	if (type === "password" || type === "hidden") return null;
	if ((el.getAttribute("autocomplete") || "").startsWith("cc-")) return null;
	const name =
		truncate(accessibleName(el), MAX_NAME) || (el.id ? `#${el.id}` : "a field");
	return `Changed “${name}” (${type})`;
}

/** The redacted address, without the origin when it is the page's own. */
function shortUrl(href: string): string {
	const redacted = redactUrl(href);
	try {
		const url = new URL(redacted);
		if (url.origin === location.origin)
			return redacted.slice(url.origin.length) || "/";
	} catch {
		// keep it whole
	}
	return redacted;
}

function recordNavigation(): void {
	const href = location.href;
	if (href === lastUrl) return;
	lastUrl = href;
	pushBreadcrumb("navigation", shortUrl(href));
}

function eventElement(event: Event): ElementLike | null {
	const target = event.target as unknown as ElementLike | null;
	if (!target || typeof target.closest !== "function") return null;
	// The widget lives in a closed Shadow DOM: its events come from its host.
	if (target.closest(WIDGET)) return null;
	return target;
}

function onClick(event: Event): void {
	try {
		const target = eventElement(event);
		if (!target) return;
		const el = target.closest(INTERACTIVE) ?? target;
		// Clicking into a field, or ticking a box, says little: the change is
		// recorded instead.
		const tag = el.tagName.toLowerCase();
		if (tag === "select" || tag === "textarea") return;
		if (
			tag === "input" &&
			!["submit", "button", "reset", "image"].includes(
				(el.getAttribute("type") || "text").toLowerCase(),
			)
		)
			return;
		pushBreadcrumb("click", describeElement(el));
	} catch {
		// never break the host page
	}
}

function onChange(event: Event): void {
	try {
		const target = eventElement(event);
		if (!target) return;
		const message = describeField(target);
		if (message) pushBreadcrumb("input", message);
	} catch {
		// never break the host page
	}
}

function onVisibility(): void {
	pushBreadcrumb(
		"app",
		document.visibilityState === "hidden"
			? "Left the tab"
			: "Came back to the tab",
	);
}

function wrapHistory(method: "pushState" | "replaceState") {
	const original = history[method];
	const wrapped = function (this: History, ...args: unknown[]) {
		const result = (original as (...a: unknown[]) => void).apply(
			this ?? history,
			args,
		);
		try {
			recordNavigation();
		} catch {
			// ignore
		}
		return result;
	} as History["pushState"];
	history[method] = wrapped;
	return { original, wrapped };
}

export function installBreadcrumbCollector(): void {
	if (
		installed ||
		typeof window === "undefined" ||
		typeof document === "undefined"
	)
		return;
	installed = true;
	recordNavigation();
	if (typeof history !== "undefined") {
		const push = wrapHistory("pushState");
		rawPushState = push.original;
		wrappedPushState = push.wrapped;
		const replace = wrapHistory("replaceState");
		rawReplaceState = replace.original;
		wrappedReplaceState = replace.wrapped;
	}
	window.addEventListener("popstate", recordNavigation);
	window.addEventListener("hashchange", recordNavigation);
	document.addEventListener("click", onClick, true);
	document.addEventListener("change", onChange, true);
	document.addEventListener("visibilitychange", onVisibility);
}

export function uninstallBreadcrumbCollector(): void {
	buffer.length = 0;
	lastUrl = "";
	if (!installed) return;
	installed = false;
	// Only restore what nobody re-wrapped in the meantime.
	if (rawPushState && history.pushState === wrappedPushState)
		history.pushState = rawPushState;
	if (rawReplaceState && history.replaceState === wrappedReplaceState)
		history.replaceState = rawReplaceState;
	rawPushState = wrappedPushState = undefined;
	rawReplaceState = wrappedReplaceState = undefined;
	window.removeEventListener("popstate", recordNavigation);
	window.removeEventListener("hashchange", recordNavigation);
	document.removeEventListener("click", onClick, true);
	document.removeEventListener("change", onChange, true);
	document.removeEventListener("visibilitychange", onVisibility);
}

export function getBreadcrumbs(): Breadcrumb[] {
	return buffer.map((entry) => ({ ...entry }));
}
