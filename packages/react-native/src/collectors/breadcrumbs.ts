import { AppState } from "react-native";
import type { Breadcrumb, BreadcrumbInput } from "../types";

const MAX_ENTRIES = 50;
const MAX_MESSAGE = 300;
const MAX_CATEGORY = 50;
const MAX_DATA_KEYS = 10;
const MAX_DATA_STRING = 200;

const buffer: Breadcrumb[] = [];
let installed = false;
let appState: string | undefined;
let subscription: { remove(): void } | undefined;

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function squash(value: string): string {
	return value.replace(/\s+/g, " ").trim();
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

const APP_STATES: Record<string, string> = {
	active: "Came back to the app",
	background: "Left the app",
};

function onAppState(next: string): void {
	// iOS passes through "inactive" for the app switcher and system alerts:
	// only the moves between foreground and background tell a story.
	if (next === appState || !APP_STATES[next]) return;
	appState = next;
	pushBreadcrumb("app", APP_STATES[next] ?? next);
}

export function installBreadcrumbCollector(): void {
	if (installed) return;
	installed = true;
	try {
		appState = AppState.currentState ?? undefined;
		subscription = AppState.addEventListener("change", onAppState);
	} catch {
		// AppState is missing in some test environments
	}
}

export function uninstallBreadcrumbCollector(): void {
	buffer.length = 0;
	if (!installed) return;
	installed = false;
	subscription?.remove();
	subscription = undefined;
	appState = undefined;
}

export function getBreadcrumbs(): Breadcrumb[] {
	return buffer.map((entry) => ({ ...entry }));
}
