import type { Strings } from "./i18n";

export type TattleStrings = Strings;
export type TattleType = "bug" | "feature";
export type Locale = "fr" | "en";
export type Position = "bottom-right" | "bottom-left";
/** "system" follows `prefers-color-scheme`. */
export type ColorScheme = "light" | "dark" | "system";

/**
 * The widget's colors, any CSS color. Each one can also be set from your own
 * stylesheet with a `--tattle-*` variable (see the README).
 */
export interface ThemeColors {
	/** Primary buttons, selected states, focus rings and the launcher. */
	accent?: string;
	/** Text and icons on `accent`. */
	accentText?: string;
	/** Panel and field background. */
	background?: string;
	text?: string;
	/** Hints, placeholders and secondary text. */
	mutedText?: string;
	border?: string;
	/** Secondary surfaces: the type switch and secondary buttons. */
	surface?: string;
	danger?: string;
	dangerBackground?: string;
	/** Overlay behind the bottom sheet on small screens. */
	backdrop?: string;
}

/**
 * How the panel appears and disappears: "pop" (fades in while growing a
 * little), "slide" (rises; the bottom sheet comes up from the screen's edge),
 * "fade", or "none".
 */
export type AnimationPreset = "pop" | "slide" | "fade" | "none";

export interface TattleAnimation {
	/**
	 * The entrance: a preset, or Web Animations keyframes from hidden to shown,
	 * e.g. `[{ opacity: 0, transform: "translateX(24px)" }, {}]`.
	 * Default "pop", and "slide" for the bottom sheet on small screens.
	 */
	enter?: AnimationPreset | Keyframe[];
	/**
	 * The exit: a preset, played back to its hidden state, or keyframes from
	 * shown to hidden. Default: the entrance, played backwards.
	 */
	exit?: AnimationPreset | Keyframe[];
	/** Duration of the entrance, in ms. Default 180, 240 for the bottom sheet. */
	duration?: number;
	/** Duration of the exit, in ms. Default: `duration`. */
	exitDuration?: number;
	/** CSS easing of the entrance. Default "cubic-bezier(.2, .8, .3, 1)". */
	easing?: string;
	/** CSS easing of the exit. Default: `easing`. */
	exitEasing?: string;
}

export interface TattleTheme extends ThemeColors {
	/** Colors used in dark mode instead of the ones above. */
	dark?: ThemeColors;
	/** CSS font-family, or "inherit" to use the font of your page's <body>. */
	fontFamily?: string;
	/** Corner radius of fields and cards: px number or CSS length. Default 10. */
	radius?: number | string;
	/** Corner radius of buttons. Default: `radius` minus 1px. 999 gives pills. */
	buttonRadius?: number | string;
	/**
	 * How the panel appears and disappears. A preset sets both, e.g. "fade".
	 * With `prefers-reduced-motion`, the panel never animates.
	 */
	animation?: AnimationPreset | TattleAnimation;
}

export interface InitOptions {
	projectKey: string;
	/** Base URL of the server, e.g. "https://tattle.example.com". */
	apiUrl?: string;
	/** Default "bottom-right". */
	position?: Position;
	/** Default true. */
	showButton?: boolean;
	/** Default from navigator.language ("fr" if it starts with "fr", else "en"). */
	locale?: Locale;
	/** CSS color, default "#2f55c9". Same as `theme.accent`. */
	accentColor?: string;
	/** Colors, font and corner radius, to match your app's design. */
	theme?: TattleTheme;
	/**
	 * Default "system". When `theme` sets surface colors (background, text…)
	 * without `theme.dark`, it defaults to "light" instead.
	 */
	colorScheme?: ColorScheme;
	/** Replaces any of the widget's texts. */
	strings?: Partial<TattleStrings>;
	/**
	 * Extra CSS added inside the widget's Shadow DOM, after its own styles.
	 * It targets the widget's `fb-*` classes, which can change between versions.
	 */
	css?: string;
	/** Extra selectors to mask in screenshots. */
	maskSelectors?: string[];
}

export interface TattleUser {
	id?: string;
	email?: string;
	name?: string;
	[trait: string]: unknown;
}

export interface OpenOptions {
	type?: TattleType;
}

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

export interface ConsoleEntry {
	level: ConsoleLevel;
	message: string;
	timestamp: number;
	stack?: string;
}

export interface NetworkEntry {
	method: string;
	url: string;
	status: number;
	durationMs: number;
	timestamp: number;
	error?: string;
}

/** One step of what the user did before the report. */
export interface Breadcrumb {
	/** "navigation", "click", "input", "app", "custom" or your own. */
	category: string;
	message: string;
	timestamp: number;
	data?: Record<string, string | number | boolean | null>;
}

export interface BreadcrumbInput {
	/** What happened, e.g. "Applied coupon SPRING". Up to 300 characters. */
	message: string;
	/** Default "custom". */
	category?: string;
	/** Up to 10 short values: strings, numbers, booleans or null. */
	data?: Record<string, unknown>;
}

export interface DeviceInfo {
	userAgent: string;
	browser: { name: string; version: string };
	os: { name: string; version: string };
	platform: string;
	language: string;
	languages: string[];
	timezone: string;
	screen: { width: number; height: number; pixelRatio: number };
	viewport: { width: number; height: number };
	colorScheme: "light" | "dark";
	online: boolean;
	deviceMemory?: number;
	connection?: { effectiveType: string; downlink: number; rtt: number };
}

export interface Reporter {
	id?: string;
	email?: string;
	name?: string;
	traits?: Record<string, unknown>;
}

export interface IngestPayload {
	projectKey: string;
	type: TattleType;
	message: string;
	screenshot?: string;
	pageUrl: string;
	pageTitle?: string;
	reporter?: Reporter;
	context?: Record<string, unknown>;
	device: DeviceInfo;
	console: ConsoleEntry[];
	network: NetworkEntry[];
	/** The last 50 steps: navigations, clicks, field changes, tab switches. */
	breadcrumbs: Breadcrumb[];
	sdk: { name: "@tattle/widget"; version: "0.1.0" };
}

export interface IngestSuccess {
	id: string;
	issueNumber?: number;
}
