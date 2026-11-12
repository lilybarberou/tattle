import { useColorScheme } from "react-native";

export const DEFAULT_ACCENT = "#2f55c9";

const light = {
	bg: "#ffffff",
	fg: "#18181b",
	muted: "#6b6b76",
	border: "#e4e4e7",
	subtle: "#f4f4f5",
	danger: "#c81e1e",
	dangerBg: "#fef2f2",
	backdrop: "rgba(9, 9, 11, 0.4)",
};

const dark: typeof light = {
	bg: "#1c1c21",
	fg: "#f4f4f5",
	muted: "#a1a1aa",
	border: "#33333b",
	subtle: "#27272e",
	danger: "#fca5a5",
	dangerBg: "rgba(220, 38, 38, 0.14)",
	backdrop: "rgba(0, 0, 0, 0.55)",
};

export type Theme = typeof light & { accent: string; accentFg: string };

export function useTheme(accent: string): Theme {
	const scheme = useColorScheme();
	return { ...(scheme === "dark" ? dark : light), accent, accentFg: "#ffffff" };
}
