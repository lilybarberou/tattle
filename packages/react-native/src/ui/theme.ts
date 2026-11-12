import type { TextStyle } from "react-native";
import type { ColorScheme, TattleTheme, ThemeColors } from "../types";

export const DEFAULT_ACCENT = "#2f55c9";
const DEFAULT_RADIUS = 11;

type ColorKey = keyof ThemeColors;

const light: Required<ThemeColors> = {
	accent: DEFAULT_ACCENT,
	accentText: "#ffffff",
	background: "#ffffff",
	text: "#18181b",
	mutedText: "#6b6b76",
	border: "#e4e4e7",
	surface: "#f4f4f5",
	danger: "#c81e1e",
	dangerBackground: "#fef2f2",
	backdrop: "rgba(9, 9, 11, 0.4)",
};

const dark: Required<ThemeColors> = {
	...light,
	background: "#1c1c21",
	text: "#f4f4f5",
	mutedText: "#a1a1aa",
	border: "#33333b",
	surface: "#27272e",
	danger: "#fca5a5",
	dangerBackground: "rgba(220, 38, 38, 0.14)",
	backdrop: "rgba(0, 0, 0, 0.55)",
};

const COLOR_KEYS = Object.keys(light) as ColorKey[];
/** Colors that only make sense for one color scheme. */
const SURFACE_KEYS: ColorKey[] = [
	"background",
	"text",
	"mutedText",
	"border",
	"surface",
	"dangerBackground",
];

type Weight = "400" | "500" | "600" | "700";

export interface Theme {
	scheme: "light" | "dark";
	accent: string;
	accentFg: string;
	bg: string;
	fg: string;
	muted: string;
	border: string;
	subtle: string;
	danger: string;
	dangerBg: string;
	backdrop: string;
	radius: number;
	buttonRadius: number;
	/** Font family and weight for a text, honoring `fontFamilyBold`. */
	font(weight: Weight): TextStyle;
}

function colors(input: unknown): ThemeColors {
	const out: ThemeColors = {};
	if (!input || typeof input !== "object") return out;
	for (const key of COLOR_KEYS) {
		const value = (input as Record<string, unknown>)[key];
		if (typeof value === "string" && value) out[key] = value;
	}
	return out;
}

const nonNegative = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: undefined;

const text = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() ? value : undefined;

/**
 * The scheme to use. Without an explicit one, a theme that sets surface colors
 * for a single scheme (no `dark`) stays light, so its colors never mix with the
 * default dark ones.
 */
export function resolveScheme(
	scheme: ColorScheme | undefined,
	theme: TattleTheme | undefined,
	system: "light" | "dark" | null | undefined,
): "light" | "dark" {
	let wanted = scheme;
	if (wanted !== "light" && wanted !== "dark" && wanted !== "system") {
		const top = colors(theme);
		const singleScheme =
			!theme?.dark && SURFACE_KEYS.some((key) => top[key] !== undefined);
		wanted = singleScheme ? "light" : "system";
	}
	if (wanted === "system") return system === "dark" ? "dark" : "light";
	return wanted;
}

export function buildTheme(
	input: TattleTheme | undefined,
	scheme: "light" | "dark",
	accentColor?: string,
): Theme {
	const c: Required<ThemeColors> = {
		...(scheme === "dark" ? dark : light),
		...(accentColor ? { accent: accentColor } : {}),
		...colors(input),
		...(scheme === "dark" ? colors(input?.dark) : {}),
	};
	const radius = nonNegative(input?.radius) ?? DEFAULT_RADIUS;
	const family = text(input?.fontFamily);
	const boldFamily = text(input?.fontFamilyBold);
	return {
		scheme,
		accent: c.accent,
		accentFg: c.accentText,
		bg: c.background,
		fg: c.text,
		muted: c.mutedText,
		border: c.border,
		subtle: c.surface,
		danger: c.danger,
		dangerBg: c.dangerBackground,
		backdrop: c.backdrop,
		radius,
		buttonRadius: nonNegative(input?.buttonRadius) ?? radius,
		font(weight) {
			if (boldFamily && (weight === "600" || weight === "700"))
				return { fontFamily: boldFamily, fontWeight: "normal" };
			return family
				? { fontFamily: family, fontWeight: weight }
				: { fontWeight: weight };
		},
	};
}

/** A radius derived from a theme radius, never below 0. */
export const offset = (radius: number, delta: number) =>
	Math.max(0, radius + delta);
