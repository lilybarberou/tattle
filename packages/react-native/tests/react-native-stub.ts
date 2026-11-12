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
