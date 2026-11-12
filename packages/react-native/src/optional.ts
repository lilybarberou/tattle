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

/** Where the reporter key is kept: the first of these the app has. */
export interface KeyValueStore {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string): Promise<void>;
}
interface SecureStore {
	getItemAsync(key: string): Promise<string | null>;
	setItemAsync(key: string, value: string): Promise<void>;
}

let keyStore: { store: KeyValueStore; name: string } | null | undefined;

/** expo-secure-store (Keychain / Keystore), else AsyncStorage, else null. */
export function persistentStore(): {
	store: KeyValueStore;
	name: string;
} | null {
	if (keyStore !== undefined) return keyStore;
	keyStore = null;
	try {
		const secure = require("expo-secure-store") as SecureStore;
		if (typeof secure?.getItemAsync === "function")
			keyStore = {
				name: "expo-secure-store",
				store: {
					getItem: (key) => secure.getItemAsync(key),
					setItem: (key, value) => secure.setItemAsync(key, value),
				},
			};
	} catch {
		// not installed
	}
	if (keyStore) return keyStore;
	try {
		const module = require("@react-native-async-storage/async-storage") as {
			default?: KeyValueStore;
		} & KeyValueStore;
		const asyncStorage = module?.default ?? module;
		if (typeof asyncStorage?.getItem === "function")
			keyStore = { name: "async-storage", store: asyncStorage };
	} catch {
		// not installed
	}
	return keyStore;
}

interface ExpoCrypto {
	getRandomBytes(count: number): Uint8Array;
}
let expoCryptoModule: ExpoCrypto | null | undefined;

export function expoCrypto(): ExpoCrypto | null {
	if (expoCryptoModule === undefined) {
		try {
			expoCryptoModule = require("expo-crypto") as ExpoCrypto;
		} catch {
			expoCryptoModule = null;
		}
	}
	return expoCryptoModule;
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
