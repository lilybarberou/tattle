import { useColorScheme } from "react-native";
import { useSettings } from "./settings";

const light = {
	background: "#f4f4f6",
	card: "#ffffff",
	text: "#18181b",
	muted: "#6b6b76",
	border: "#e4e4e7",
	accent: "#2f55c9",
	secret: "#fde68a",
	secretText: "#78350f",
	danger: "#c62828",
};

export type Palette = typeof light;

const dark: Palette = {
	background: "#111114",
	card: "#1c1c21",
	text: "#f4f4f5",
	muted: "#a1a1aa",
	border: "#33333b",
	accent: "#7d9bff",
	secret: "#5c4813",
	secretText: "#fde68a",
	danger: "#ff8a80",
};

/** The playground follows the color scheme chosen for the widget. */
export function usePalette(): { palette: Palette; dark: boolean } {
	const system = useColorScheme();
	const { settings } = useSettings();
	const scheme =
		settings.colorScheme === "system" ? system : settings.colorScheme;
	return scheme === "dark"
		? { palette: dark, dark: true }
		: { palette: light, dark: false };
}
