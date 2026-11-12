// Just enough of react-native for the device collector, driven by the tests.
export const Platform = {
	OS: "ios" as string,
	Version: "18.2" as string | number,
	constants: {} as Record<string, unknown>,
};

export const Dimensions = {
	get: (which: "screen" | "window") =>
		which === "screen"
			? { width: 393, height: 852 }
			: { width: 393, height: 800 },
};

export const PixelRatio = { get: () => 3, getFontScale: () => 1.1 };

export const Appearance = { getColorScheme: () => "dark" as const };

type AppStateListener = (state: string) => void;
export const AppState = {
	currentState: "active" as string,
	listeners: new Set<AppStateListener>(),
	addEventListener(_event: "change", listener: AppStateListener) {
		AppState.listeners.add(listener);
		return { remove: () => AppState.listeners.delete(listener) };
	},
	/** Test helper: moves the app to another state. */
	emit(state: string) {
		AppState.currentState = state;
		for (const listener of AppState.listeners) listener(state);
	},
};
