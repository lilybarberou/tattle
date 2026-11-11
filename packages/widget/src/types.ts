export type TattleType = "bug" | "feature";
export type Locale = "fr" | "en";
export type Position = "bottom-right" | "bottom-left";

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
	/** CSS color, default "#2f55c9". */
	accentColor?: string;
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
	sdk: { name: "@tattle/widget"; version: "0.1.0" };
}

export interface IngestSuccess {
	id: string;
	issueNumber?: number;
}
