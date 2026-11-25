import { Platform } from "react-native";

/**
 * A local `pnpm dev` server as the simulators reach it: the iOS Simulator
 * shares the Mac's network, the Android emulator sees the Mac as 10.0.2.2.
 */
const localServer =
	Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

// Expo inlines EXPO_PUBLIC_* variables from .env at bundle time.
export const apiUrl = (
	process.env.EXPO_PUBLIC_TATTLE_URL || localServer
).replace(/\/+$/, "");

export const projectKey = process.env.EXPO_PUBLIC_TATTLE_PROJECT_KEY ?? "";

/** False until .env has a project key: reports would be refused. */
export const hasProjectKey = /^pk_[0-9a-z]+$/i.test(projectKey);
