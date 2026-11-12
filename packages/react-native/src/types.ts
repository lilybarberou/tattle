export type TattleType = "bug" | "feature";
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
	/** Any React Native color. Default "#2f55c9". */
	accentColor?: string;
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
	sdk: { name: string; version: string };
}

export interface IngestSuccess {
	id: string;
	issueNumber?: number;
}
