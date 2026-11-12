import { installConsoleCollector } from "./collectors/console";
import { installNetworkCollector } from "./collectors/network";
import { requestClose, requestOpen, state } from "./state";
import type { OpenOptions, TattleUser } from "./types";

export type {
	AnimationPreset,
	AppInfo,
	ColorScheme,
	ConsoleEntry,
	ConsoleLevel,
	DeviceInfo,
	IngestPayload,
	IngestSuccess,
	Locale,
	NetworkEntry,
	OpenOptions,
	Reporter,
	TattleAnimation,
	TattleOptions,
	TattleStrings,
	TattleTheme,
	TattleType,
	TattleUser,
	ThemeColors,
} from "./types";
export { TattleMask } from "./ui/Mask";
export { TattleProvider, type TattleProviderProps } from "./ui/Provider";

// Collectors start as soon as the SDK is imported, so early logs and requests
// are kept: import it near the top of your entry file.
installConsoleCollector();
installNetworkCollector();

/** Sets (or clears with `null`) the user attached to reports. */
export function identify(user: TattleUser | null): void {
	state.user = user && typeof user === "object" ? { ...user } : null;
}

/** Merges free-form metadata attached to every report. */
export function setContext(context: Record<string, unknown>): void {
	if (!context || typeof context !== "object") return;
	state.context = { ...(state.context ?? {}), ...context };
}

/** Names the screen the user is on; reports show it. */
export function setScreen(name: string | null | undefined): void {
	state.screen = typeof name === "string" ? name : "";
}

/** Opens the feedback form. Works before the provider mounts too. */
export function open(options?: OpenOptions): void {
	requestOpen(options);
}

export function close(): void {
	requestClose();
}

export const Tattle = { identify, setContext, setScreen, open, close };
export default Tattle;
