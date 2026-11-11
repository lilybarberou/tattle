import type { DeviceInfo } from "../types";

interface NameVersion {
	name: string;
	version: string;
}

const WINDOWS_VERSIONS: Record<string, string> = {
	"10.0": "10",
	"6.3": "8.1",
	"6.2": "8",
	"6.1": "7",
	"6.0": "Vista",
	"5.1": "XP",
};

type Rule = [RegExp, string, ((ua: string, v: string) => string)?];

const BROWSER_RULES: Rule[] = [
	[/\b(?:Edg|Edge|EdgA|EdgiOS)\/([\d.]+)/, "Edge"],
	// Legacy Presto Opera reports its real version in "Version/x".
	[
		/\b(?:OPR|OPT|Opera)\/([\d.]+)/,
		"Opera",
		(ua, v) => /\bVersion\/([\d.]+)/.exec(ua)?.[1] ?? v,
	],
	[/\b(?:Firefox|FxiOS)\/([\d.]+)/, "Firefox"],
	[/\b(?:HeadlessChrome|Chrome|CriOS|Chromium)\/([\d.]+)/, "Chrome"],
	[/\bVersion\/([\d.]+).*Safari\//, "Safari"],
	[
		/AppleWebKit\/.*\b(?:iPhone|iPad|iPod)\b()|\b(?:iPhone|iPad|iPod)\b.*AppleWebKit\/()/,
		"Safari",
	],
];

const OS_RULES: Rule[] = [
	[
		/\b(?:iPhone|iPad|iPod)\b.*?\bOS ([\d_]+)/,
		"iOS",
		(_, v) => v.replace(/_/g, "."),
	],
	[/\bAndroid ?([\d.]*)/, "Android"],
	[/\bWindows NT ([\d.]+)/, "Windows", (_, v) => WINDOWS_VERSIONS[v] ?? v],
	[/\bWindows\b()/, "Windows"],
	[/\bMac OS X ?([\d_.]*)/, "macOS", (_, v) => v.replace(/_/g, ".")],
	[/\bMacintosh\b()/, "macOS"],
	[/\bCrOS \S+ ([\d.]+)/, "ChromeOS"],
	[/\bLinux\b()/, "Linux"],
];

function applyRules(ua: string, rules: Rule[]): NameVersion {
	for (const [re, name, version] of rules) {
		const m = re.exec(ua);
		if (!m) continue;
		const raw = m.slice(1).find((g) => g !== undefined) ?? "";
		return { name, version: version ? version(ua, raw) : raw };
	}
	return { name: "Unknown", version: "" };
}

export function parseBrowser(ua: string): NameVersion {
	return applyRules(ua, BROWSER_RULES);
}

export function parseOs(ua: string, maxTouchPoints = 0): NameVersion {
	// iPadOS 13+ pretends to be a Mac; touch support gives it away.
	if (/Macintosh/.test(ua) && maxTouchPoints > 1) {
		return { name: "iOS", version: /\bVersion\/([\d.]+)/.exec(ua)?.[1] ?? "" };
	}
	return applyRules(ua, OS_RULES);
}

interface NavigatorExtras {
	deviceMemory?: number;
	connection?: { effectiveType?: string; downlink?: number; rtt?: number };
	userAgentData?: { platform?: string };
}

export function getDeviceInfo(): DeviceInfo {
	const nav = navigator as Navigator & NavigatorExtras;
	const ua = nav.userAgent || "";
	let timezone = "";
	try {
		timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
	} catch {
		// ignore
	}
	const dark =
		typeof matchMedia === "function" &&
		matchMedia("(prefers-color-scheme: dark)").matches;
	const info: DeviceInfo = {
		userAgent: ua,
		browser: parseBrowser(ua),
		os: parseOs(ua, nav.maxTouchPoints || 0),
		platform: nav.userAgentData?.platform || nav.platform || "",
		language: nav.language || "",
		languages: Array.from(
			nav.languages || (nav.language ? [nav.language] : []),
		),
		timezone,
		screen: {
			width: screen.width,
			height: screen.height,
			pixelRatio: window.devicePixelRatio || 1,
		},
		viewport: { width: window.innerWidth, height: window.innerHeight },
		colorScheme: dark ? "dark" : "light",
		online: nav.onLine !== false,
	};
	if (typeof nav.deviceMemory === "number")
		info.deviceMemory = nav.deviceMemory;
	const c = nav.connection;
	if (c && typeof c.effectiveType === "string") {
		info.connection = {
			effectiveType: c.effectiveType,
			downlink: typeof c.downlink === "number" ? c.downlink : 0,
			rtt: typeof c.rtt === "number" ? c.rtt : 0,
		};
	}
	return info;
}
