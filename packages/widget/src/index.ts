import {
	installConsoleCollector,
	uninstallConsoleCollector,
} from "./collectors/console";
import {
	installNetworkCollector,
	uninstallNetworkCollector,
} from "./collectors/network";
import { detectLocale } from "./i18n";
import { internalState } from "./internal";
import { ingestUrl } from "./payload";
import type { InitOptions, OpenOptions, TattleUser } from "./types";
import { Widget } from "./ui/widget";

export type {
	ConsoleEntry,
	ConsoleLevel,
	DeviceInfo,
	IngestPayload,
	IngestSuccess,
	InitOptions,
	Locale,
	NetworkEntry,
	OpenOptions,
	Position,
	Reporter,
	TattleType,
	TattleUser,
} from "./types";

const DEFAULT_ACCENT = "#2f55c9";
const isBrowser =
	typeof window !== "undefined" && typeof document !== "undefined";

let widget: Widget | null = null;
let user: TattleUser | null = null;
let context: Record<string, unknown> | null = null;
let pendingOpen: OpenOptions | null = null;

function startCollectors(): void {
	if (!isBrowser) return;
	installConsoleCollector();
	installNetworkCollector();
}

// Collectors start as soon as the SDK is evaluated so early logs/requests are kept.
startCollectors();

function defaultApiUrl(): string {
	return isBrowser ? location.origin : "";
}

function validColor(color: string | undefined): string {
	if (!color) return DEFAULT_ACCENT;
	try {
		return typeof CSS !== "undefined" &&
			CSS.supports &&
			!CSS.supports("color", color)
			? DEFAULT_ACCENT
			: color;
	} catch {
		return DEFAULT_ACCENT;
	}
}

/** Initializes the widget. Calling it again replaces the previous instance. */
export function init(options: InitOptions): void {
	if (!isBrowser) return;
	if (
		!options ||
		typeof options.projectKey !== "string" ||
		!options.projectKey
	) {
		console.error("[tattle] init: `projectKey` is required");
		return;
	}
	widget?.destroy();
	startCollectors();
	const apiUrl = (options.apiUrl || defaultApiUrl()).replace(/\/+$/, "");
	const endpoint = new URL(ingestUrl(apiUrl), location.href).href;
	if (!internalState.ignoredUrls.includes(endpoint))
		internalState.ignoredUrls.push(endpoint);

	widget = new Widget(
		{
			projectKey: options.projectKey,
			apiUrl,
			position:
				options.position === "bottom-left" ? "bottom-left" : "bottom-right",
			showButton: options.showButton !== false,
			locale:
				options.locale === "fr" || options.locale === "en"
					? options.locale
					: detectLocale(),
			accentColor: validColor(options.accentColor),
			maskSelectors: Array.isArray(options.maskSelectors)
				? options.maskSelectors.filter((s) => typeof s === "string")
				: [],
		},
		{ getUser: () => user, getContext: () => context },
	);
	widget.mount();
	if (pendingOpen) {
		const opts = pendingOpen;
		pendingOpen = null;
		widget.open(opts.type);
	}
}

/** Sets (or clears with `null`) the current user. May be called before `init`. */
export function identify(next: TattleUser | null): void {
	user = next && typeof next === "object" ? { ...next } : null;
	widget?.refreshIdentity();
}

/** Merges free-form metadata attached to every report. May be called before `init`. */
export function setContext(next: Record<string, unknown>): void {
	if (!next || typeof next !== "object") return;
	context = { ...(context ?? {}), ...next };
}

/** Opens the panel. Before `init`, the request is kept and applied on init. */
export function open(options?: OpenOptions): void {
	const type =
		options?.type === "feature" || options?.type === "bug"
			? options.type
			: undefined;
	if (!widget) {
		pendingOpen = type ? { type } : {};
		return;
	}
	widget.open(type);
}

export function close(): void {
	pendingOpen = null;
	widget?.close();
}

/** Removes the widget, restores patched globals and clears all state. */
export function destroy(): void {
	widget?.destroy();
	widget = null;
	user = null;
	context = null;
	pendingOpen = null;
	internalState.ignoredUrls.length = 0;
	if (!isBrowser) return;
	uninstallConsoleCollector();
	uninstallNetworkCollector();
}

export const Tattle = { init, identify, setContext, open, close, destroy };
export default Tattle;
