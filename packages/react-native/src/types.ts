import type { Strings } from "./i18n";

export type TattleStrings = Strings;
export type TattleType = "bug" | "feature";
/** "system" follows the device's appearance. */
export type ColorScheme = "light" | "dark" | "system";

/** The widget's colors, any React Native color. */
export interface ThemeColors {
	/** Primary buttons, selected states and the floating button. */
	accent?: string;
	/** Text and icons on `accent`. */
	accentText?: string;
	/** Sheet and field background. */
	background?: string;
	text?: string;
	/** Hints, placeholders and secondary text. */
	mutedText?: string;
	border?: string;
	/** Secondary surfaces: the type switch and secondary buttons. */
	surface?: string;
	danger?: string;
	dangerBackground?: string;
	/** Overlay behind the sheet. */
	backdrop?: string;
	/** Background of the chosen feedback type. Default: `background`. */
	selected?: string;
	/** Text and icon of the chosen type. Default: `text`, its icon `accent`. */
	selectedText?: string;
	/** Edge of the chosen type. Default: `border`. */
	selectedBorder?: string;
	/**
	 * A solid edge under the send button, which sinks onto it while pressed
	 * (usually a darker `accent`). Default: none, the button fades instead.
	 */
	accentEdge?: string;
}

/**
 * How the sheet appears and disappears: "fade" (with its backdrop), "slide"
 * (it rises from the bottom edge while the backdrop fades), "pop" (it fades
 * in while growing a little), or "none".
 */
export type AnimationPreset = "fade" | "slide" | "pop" | "none";

export interface TattleAnimation {
	/** The entrance. Default "fade". */
	enter?: AnimationPreset;
	/** The exit, played back to the preset's hidden state. Default: `enter`. */
	exit?: AnimationPreset;
	/** Duration of the entrance, in ms. Default 220, 300 for "slide". */
	duration?: number;
	/** Duration of the exit, in ms. Default: `duration`. */
	exitDuration?: number;
	/** Easing of the entrance, e.g. `Easing.out(Easing.back(1.5))`. Default `Easing.out(Easing.cubic)`. */
	easing?: (value: number) => number;
	/** Easing of the exit. Default: `easing`. */
	exitEasing?: (value: number) => number;
}

export interface TattleTheme extends ThemeColors {
	/** Colors used in dark mode instead of the ones above. */
	dark?: ThemeColors;
	/** Font for all texts, as you load it (e.g. "Inter_400Regular"). */
	fontFamily?: string;
	/**
	 * Font for titles, labels and buttons. Android ignores `fontWeight` with
	 * most custom fonts, so give the bold file here (e.g. "Inter_600SemiBold").
	 * Default: `fontFamily` with a bold weight.
	 */
	fontFamilyBold?: string;
	/**
	 * Font of the sheet's title, e.g. your headings' ("Fraunces_600SemiBold"),
	 * drawn with no extra weight: give the file of the weight you want.
	 * Default: the bold font.
	 */
	titleFontFamily?: string;
	/** Size of the sheet's title. Default 17. */
	titleFontSize?: number;
	/** Corner radius of fields and cards. Default 11. */
	radius?: number;
	/** Corner radius of buttons. Default: `radius`. 999 gives pills. */
	buttonRadius?: number;
	/**
	 * How the sheet appears and disappears. A preset sets both, e.g. "slide".
	 * With Reduce Motion on, slides and pops become fades.
	 */
	animation?: AnimationPreset | TattleAnimation;
}
export type Locale = "fr" | "en";

export interface TattleOptions {
	/** The project's public key, `pk_…`. */
	projectKey: string;
	/** Base URL of your Tattle server, e.g. "https://tattle.example.com". */
	apiUrl: string;
	/** Shows a floating button users can drag along the screen edge. Default true. */
	showButton?: boolean;
	/** Screen edge the button starts on. Default "right". */
	buttonSide?: "left" | "right";
	/** Default from the device language ("fr" if it starts with "fr", else "en"). */
	locale?: Locale;
	/** Any React Native color. Default "#2f55c9". Same as `theme.accent`. */
	accentColor?: string;
	/** Colors, fonts and corner radius, to match your app's design. */
	theme?: TattleTheme;
	/**
	 * Default "system". Pass your app's own scheme when it has a theme switch.
	 * When `theme` sets surface colors (background, text…) without
	 * `theme.dark`, it defaults to "light" instead.
	 */
	colorScheme?: ColorScheme;
	/** Replaces any of the widget's texts. */
	strings?: Partial<TattleStrings>;
	/**
	 * Background behind your app, seen in screenshots wherever your screens
	 * are transparent. Default white, or black in dark mode.
	 */
	backgroundColor?: string;
	/**
	 * Your app's name and version. Read from `expo-application` when it is
	 * installed; set it here otherwise.
	 */
	app?: AppInfo;
	/**
	 * The release reports are filed under, e.g. "1.4.2" or an OTA update id.
	 * Default: the app's version and build, e.g. "1.4.2 (87)".
	 */
	release?: string;
}

export interface AppInfo {
	name?: string;
	version?: string;
	build?: string;
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
	/** "navigation", "app", "custom" or your own. */
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
	platform: "ios" | "android" | string;
	os: { name: string; version: string };
	model?: string;
	manufacturer?: string;
	deviceType?: string;
	isDevice?: boolean;
	app?: AppInfo;
	runtime: { reactNative?: string; hermes: boolean };
	language: string;
	languages: string[];
	timezone: string;
	screen: {
		width: number;
		height: number;
		pixelRatio: number;
		fontScale: number;
	};
	viewport: { width: number; height: number };
	colorScheme: "light" | "dark";
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
	/** The current screen, from `Tattle.setScreen`. */
	pageUrl: string;
	reporter?: Reporter;
	context?: Record<string, unknown>;
	device: DeviceInfo;
	console: ConsoleEntry[];
	network: NetworkEntry[];
	/** The last 50 steps: screens, foreground and background, your own. */
	breadcrumbs: Breadcrumb[];
	/** `release`, or the app's version and build. */
	release?: string;
	sdk: { name: string; version: string };
}

export interface IngestSuccess {
	id: string;
	issueNumber?: number;
}
