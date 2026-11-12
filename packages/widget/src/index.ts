import {
	installBreadcrumbCollector,
	addBreadcrumb as pushCustomBreadcrumb,
	uninstallBreadcrumbCollector,
} from "./collectors/breadcrumbs";
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
import { cleanRelease, ingestUrl } from "./payload";
import {
	isColor,
	isColorScheme,
	sanitizeStrings,
	sanitizeTheme,
} from "./theme";
import type {
	BreadcrumbInput,
	ColorScheme,
	InitOptions,
	OpenOptions,
	TattleTheme,
	TattleUser,
} from "./types";
import { Widget } from "./ui/widget";

export type {
	AnimationPreset,
	Breadcrumb,
	BreadcrumbInput,
	ColorScheme,
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
	TattleAnimation,
	TattleStrings,
	TattleTheme,
	TattleType,
	TattleUser,
	ThemeColors,
} from "./types";

const isBrowser =
	typeof window !== "undefined" && typeof document !== "undefined";

let widget: Widget | null = null;
let user: TattleUser | null = null;
let context: Record<string, unknown> | null = null;
let pendingOpen: OpenOptions | null = null;
/** setTheme / setColorScheme calls made before init. */
let pendingTheme: TattleTheme | undefined;
let pendingScheme: ColorScheme | undefined;

function startCollectors(): void {
	if (!isBrowser) return;
	installConsoleCollector();
	installNetworkCollector();
	installBreadcrumbCollector();
}

// Collectors start as soon as the SDK is evaluated so early logs/requests are kept.
startCollectors();

function defaultApiUrl(): string {
	return isBrowser ? location.origin : "";
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
			accentColor: isColor(options.accentColor)
				? options.accentColor
				: undefined,
			theme:
				options.theme !== undefined
					? sanitizeTheme(options.theme)
					: (pendingTheme ?? {}),
			colorScheme: isColorScheme(options.colorScheme)
				? options.colorScheme
				: pendingScheme,
			strings: sanitizeStrings(options.strings),
			css: typeof options.css === "string" ? options.css : "",
			maskSelectors: Array.isArray(options.maskSelectors)
				? options.maskSelectors.filter((s) => typeof s === "string")
				: [],
			release: cleanRelease(options.release),
		},
		{ getUser: () => user, getContext: () => context },
	);
	pendingTheme = undefined;
	pendingScheme = undefined;
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

/**
 * Adds a step to the trail sent with the next report, next to the navigations,
 * clicks and field changes the widget records. May be called before `init`.
 */
export function addBreadcrumb(breadcrumb: BreadcrumbInput): void {
	pushCustomBreadcrumb(breadcrumb);
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

/**
 * Replaces the theme given to `init`, without losing what the user typed.
 * Before `init`, it is kept and used when `init` sets no theme.
 * For a light/dark switch, `setColorScheme` is enough.
 */
export function setTheme(theme: TattleTheme): void {
	const next = sanitizeTheme(theme);
	if (widget) widget.setTheme(next);
	else pendingTheme = next;
}

/** Forces light or dark, e.g. to follow your app's own theme switch. */
export function setColorScheme(scheme: ColorScheme): void {
	const next = isColorScheme(scheme) ? scheme : undefined;
	if (widget) widget.setColorScheme(next);
	else pendingScheme = next;
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
	pendingTheme = undefined;
	pendingScheme = undefined;
	internalState.ignoredUrls.length = 0;
	if (!isBrowser) return;
	uninstallConsoleCollector();
	uninstallNetworkCollector();
	uninstallBreadcrumbCollector();
}

export const Tattle = {
	init,
	identify,
	setContext,
	addBreadcrumb,
	setTheme,
	setColorScheme,
	open,
	close,
	destroy,
};
export default Tattle;
