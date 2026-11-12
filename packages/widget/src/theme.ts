import type { Strings } from "./i18n";
import { sanitizeAnimation } from "./motion";
import type { ColorScheme, TattleTheme, ThemeColors } from "./types";

export const DEFAULT_ACCENT = "#2f55c9";
const DEFAULT_FONT =
	'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

type ColorKey = keyof ThemeColors;
type Palette = Record<ColorKey, string>;

/** Each color token: its internal `--fb-*` variable and the page's `--tattle-*` one. */
const COLOR_VARS: Record<ColorKey, [internal: string, page: string]> = {
	accent: ["--fb-accent", "--tattle-accent"],
	accentText: ["--fb-accent-fg", "--tattle-accent-text"],
	background: ["--fb-bg", "--tattle-background"],
	text: ["--fb-fg", "--tattle-text"],
	mutedText: ["--fb-muted", "--tattle-muted-text"],
	border: ["--fb-border", "--tattle-border"],
	surface: ["--fb-subtle", "--tattle-surface"],
	danger: ["--fb-danger", "--tattle-danger"],
	dangerBackground: ["--fb-danger-bg", "--tattle-danger-background"],
	backdrop: ["--fb-backdrop", "--tattle-backdrop"],
};
const COLOR_KEYS = Object.keys(COLOR_VARS) as ColorKey[];
/** Colors that only make sense for one color scheme. */
const SURFACE_KEYS: ColorKey[] = [
	"background",
	"text",
	"mutedText",
	"border",
	"surface",
	"dangerBackground",
];

const LIGHT: Palette = {
	accent: DEFAULT_ACCENT,
	accentText: "#ffffff",
	background: "#ffffff",
	text: "#18181b",
	mutedText: "#6b6b76",
	border: "#e4e4e7",
	surface: "#f4f4f5",
	danger: "#c81e1e",
	dangerBackground: "#fef2f2",
	backdrop: "rgba(9, 9, 11, .4)",
};
const DARK: Palette = {
	...LIGHT,
	background: "#1c1c21",
	text: "#f4f4f5",
	mutedText: "#a1a1aa",
	border: "#33333b",
	surface: "#27272e",
	danger: "#fca5a5",
	dangerBackground: "rgba(220, 38, 38, .14)",
	backdrop: "rgba(0, 0, 0, .55)",
};
const SHADOW = {
	light:
		"0 16px 48px -12px rgba(15, 15, 25, .28), 0 4px 12px -4px rgba(15, 15, 25, .12)",
	dark: "0 16px 48px -12px rgba(0, 0, 0, .7), 0 0 0 1px rgba(255, 255, 255, .04)",
};

function supports(property: string, value: string): boolean {
	try {
		return typeof CSS === "undefined" || !CSS.supports
			? true
			: CSS.supports(property, value);
	} catch {
		return false;
	}
}

export function isColor(value: unknown): value is string {
	return typeof value === "string" && value !== "" && supports("color", value);
}

function length(value: unknown): string | undefined {
	if (typeof value === "number")
		return Number.isFinite(value) && value >= 0 ? `${value}px` : undefined;
	if (typeof value === "string" && value && supports("border-radius", value))
		return value;
	return undefined;
}

function pickColors(input: unknown, path: string): ThemeColors {
	const out: ThemeColors = {};
	if (!input || typeof input !== "object") return out;
	for (const key of COLOR_KEYS) {
		const value = (input as Record<string, unknown>)[key];
		if (value === undefined) continue;
		if (isColor(value)) out[key] = value;
		else console.warn(`[tattle] ignoring invalid color ${path}${key}:`, value);
	}
	return out;
}

/** Keeps the valid parts of a theme from untrusted input. */
export function sanitizeTheme(input: unknown): TattleTheme {
	if (!input || typeof input !== "object") return {};
	const raw = input as Record<string, unknown>;
	const theme: TattleTheme = pickColors(raw, "theme.");
	if (raw.dark && typeof raw.dark === "object")
		theme.dark = pickColors(raw.dark, "theme.dark.");
	if (typeof raw.fontFamily === "string" && raw.fontFamily.trim())
		theme.fontFamily = raw.fontFamily.trim();
	for (const key of ["radius", "buttonRadius"] as const) {
		if (raw[key] === undefined) continue;
		const value = length(raw[key]);
		if (value) theme[key] = value;
		else console.warn(`[tattle] ignoring invalid theme.${key}:`, raw[key]);
	}
	const animation = sanitizeAnimation(raw.animation);
	if (animation) theme.animation = animation;
	return theme;
}

export function sanitizeStrings(input: unknown): Partial<Strings> {
	const out: Record<string, string> = {};
	if (!input || typeof input !== "object") return out;
	for (const [key, value] of Object.entries(input))
		if (typeof value === "string") out[key] = value;
	return out as Partial<Strings>;
}

export function isColorScheme(value: unknown): value is ColorScheme {
	return value === "light" || value === "dark" || value === "system";
}

/**
 * The scheme to use. Without an explicit one, a theme that sets surface colors
 * for a single scheme (no `dark`) stays light, so its colors never mix with the
 * default dark ones.
 */
export function resolveScheme(
	scheme: ColorScheme | undefined,
	theme: TattleTheme,
): ColorScheme {
	if (scheme) return scheme;
	const singleScheme =
		!theme.dark && SURFACE_KEYS.some((key) => theme[key] !== undefined);
	return singleScheme ? "light" : "system";
}

/**
 * The `--fb-*` variables for one scheme. What the theme does not set falls back
 * to the page's `--tattle-*` variable, then to the default.
 */
export function themeVariables(
	theme: TattleTheme,
	scheme: "light" | "dark",
	accentFallback?: string,
): Record<string, string> {
	const defaults = scheme === "dark" ? DARK : LIGHT;
	const colors: ThemeColors = {
		...(accentFallback ? { accent: accentFallback } : {}),
		...theme,
		...(scheme === "dark" ? theme.dark : undefined),
	};
	const vars: Record<string, string> = {};
	for (const key of COLOR_KEYS) {
		const [internal, page] = COLOR_VARS[key];
		vars[internal] = colors[key] ?? `var(${page}, ${defaults[key]})`;
	}
	vars["--fb-shadow"] = `var(--tattle-shadow, ${SHADOW[scheme]})`;
	vars["--fb-font"] =
		theme.fontFamily ?? `var(--tattle-font-family, ${DEFAULT_FONT})`;
	vars["--fb-radius"] = length(theme.radius) ?? "var(--tattle-radius, 10px)";
	vars["--fb-btn-radius"] =
		length(theme.buttonRadius) ??
		"var(--tattle-button-radius, max(0px, calc(var(--fb-radius) - 1px)))";
	return vars;
}
