import { Appearance, Dimensions, PixelRatio, Platform } from "react-native";
import { expoApplication, expoDevice } from "../optional";
import type { AppInfo, DeviceInfo } from "../types";

interface PlatformConstants {
	// iOS
	osVersion?: string;
	systemName?: string;
	interfaceIdiom?: string;
	// Android
	Release?: string;
	Model?: string;
	Manufacturer?: string;
	Brand?: string;
	uiMode?: string;
	// Both
	reactNativeVersion?: {
		major: number;
		minor: number;
		patch: number;
		prerelease?: string | number | null;
	};
}

const clean = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() ? value.trim() : undefined;

function osInfo(constants: PlatformConstants): {
	name: string;
	version: string;
} {
	if (Platform.OS === "ios")
		return {
			name: clean(constants.systemName) ?? "iOS",
			version: clean(constants.osVersion) ?? String(Platform.Version),
		};
	if (Platform.OS === "android")
		return {
			name: "Android",
			version: clean(constants.Release) ?? `API ${Platform.Version}`,
		};
	return { name: Platform.OS, version: String(Platform.Version ?? "") };
}

function deviceType(constants: PlatformConstants): string | undefined {
	const idiom = clean(constants.interfaceIdiom) ?? clean(constants.uiMode);
	if (!idiom) return undefined;
	if (idiom === "pad") return "tablet";
	if (idiom === "normal") return "phone";
	return idiom;
}

function reactNativeVersion(constants: PlatformConstants): string | undefined {
	const v = constants.reactNativeVersion;
	if (!v) return undefined;
	return `${v.major}.${v.minor}.${v.patch}${v.prerelease ? `-${v.prerelease}` : ""}`;
}

export function appInfo(override?: AppInfo): AppInfo | undefined {
	const expo = expoApplication();
	const app: AppInfo = {};
	const name = clean(override?.name) ?? clean(expo?.applicationName);
	const version =
		clean(override?.version) ?? clean(expo?.nativeApplicationVersion);
	const build = clean(override?.build) ?? clean(expo?.nativeBuildVersion);
	if (name) app.name = name;
	if (version) app.version = version;
	if (build) app.build = build;
	return Object.keys(app).length ? app : undefined;
}

function locales(): {
	language: string;
	languages: string[];
	timezone: string;
} {
	try {
		const options = Intl.DateTimeFormat().resolvedOptions();
		return {
			language: options.locale,
			languages: [options.locale],
			timezone: options.timeZone ?? "",
		};
	} catch {
		return { language: "", languages: [], timezone: "" };
	}
}

export function getDeviceInfo(app?: AppInfo): DeviceInfo {
	const constants = (Platform.constants ?? {}) as PlatformConstants;
	const screen = Dimensions.get("screen");
	const window = Dimensions.get("window");
	const expo = expoDevice();
	const info: DeviceInfo = {
		platform: Platform.OS,
		os: osInfo(constants),
		runtime: {
			hermes:
				typeof (globalThis as { HermesInternal?: unknown }).HermesInternal ===
				"object",
		},
		...locales(),
		screen: {
			width: Math.round(screen.width),
			height: Math.round(screen.height),
			pixelRatio: PixelRatio.get(),
			fontScale: PixelRatio.getFontScale(),
		},
		viewport: {
			width: Math.round(window.width),
			height: Math.round(window.height),
		},
		colorScheme: Appearance.getColorScheme() === "dark" ? "dark" : "light",
	};
	const rn = reactNativeVersion(constants);
	if (rn) info.runtime.reactNative = rn;
	const model = clean(expo?.modelName) ?? clean(constants.Model);
	if (model) info.model = model;
	const manufacturer =
		clean(expo?.manufacturer) ??
		clean(constants.Manufacturer) ??
		(Platform.OS === "ios" ? "Apple" : undefined);
	if (manufacturer) info.manufacturer = manufacturer;
	const type = deviceType(constants);
	if (type) info.deviceType = type;
	if (expo) info.isDevice = expo.isDevice;
	const resolvedApp = appInfo(app);
	if (resolvedApp) info.app = resolvedApp;
	return info;
}
