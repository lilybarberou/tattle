import type { ColorScheme, Locale } from "@tattle/react-native";
import { createContext, use } from "react";

/** What the Account screen changes on the provider, to try its options. */
export interface Settings {
	/** `undefined`: the device's language. */
	locale: Locale | undefined;
	colorScheme: ColorScheme;
	showButton: boolean;
	buttonSide: "left" | "right";
}

export const defaultSettings: Settings = {
	locale: undefined,
	colorScheme: "system",
	showButton: true,
	buttonSide: "right",
};

export const SettingsContext = createContext<{
	settings: Settings;
	update: (change: Partial<Settings>) => void;
}>({ settings: defaultSettings, update: () => {} });

export const useSettings = () => use(SettingsContext);
