/**
 * Modules read when the app has them installed. The `require` calls sit
 * directly in try blocks, which Metro treats as optional dependencies: apps
 * without these packages still bundle.
 */
interface ExpoApplication {
	applicationName: string | null;
	nativeApplicationVersion: string | null;
	nativeBuildVersion: string | null;
}
interface ExpoDevice {
	modelName: string | null;
	manufacturer: string | null;
	isDevice: boolean;
}

export interface Insets {
	top: number;
	bottom: number;
	left: number;
	right: number;
}
interface SafeAreaContext {
	SafeAreaInsetsContext: import("react").Context<Insets | null>;
	initialWindowMetrics: { insets: Insets } | null;
}

declare const require: (id: string) => unknown;

let application: ExpoApplication | null | undefined;
let device: ExpoDevice | null | undefined;

export function expoApplication(): ExpoApplication | null {
	if (application === undefined) {
		try {
			application = require("expo-application") as ExpoApplication;
		} catch {
			application = null;
		}
	}
	return application;
}

export function expoDevice(): ExpoDevice | null {
	if (device === undefined) {
		try {
			device = require("expo-device") as ExpoDevice;
		} catch {
			device = null;
		}
	}
	return device;
}

let safeArea: SafeAreaContext | null | undefined;

export function safeAreaContext(): SafeAreaContext | null {
	if (safeArea === undefined) {
		try {
			safeArea = require("react-native-safe-area-context") as SafeAreaContext;
		} catch {
			safeArea = null;
		}
	}
	return safeArea;
}
