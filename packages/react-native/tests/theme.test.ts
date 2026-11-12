import { describe, expect, it } from "vitest";
import { buildTheme, resolveScheme } from "../src/ui/theme";

describe("resolveScheme", () => {
	it("follows the system by default", () => {
		expect(resolveScheme(undefined, undefined, "dark")).toBe("dark");
		expect(resolveScheme("system", undefined, null)).toBe("light");
	});

	it("keeps an explicit scheme", () => {
		expect(resolveScheme("light", undefined, "dark")).toBe("light");
	});

	it("stays light when surface colors are set for one scheme only", () => {
		expect(resolveScheme(undefined, { background: "#fff" }, "dark")).toBe(
			"light",
		);
		expect(
			resolveScheme(undefined, { background: "#fff", dark: {} }, "dark"),
		).toBe("dark");
	});
});

describe("buildTheme", () => {
	it("merges defaults, accentColor, theme and dark overrides", () => {
		const input = { text: "#111", dark: { background: "#000" } };
		const dark = buildTheme(input, "dark", "#e11d48");
		expect(dark.bg).toBe("#000");
		expect(dark.fg).toBe("#111");
		expect(dark.accent).toBe("#e11d48");
		expect(buildTheme(input, "light").bg).toBe("#ffffff");
	});

	it("derives the button radius from the radius", () => {
		expect(buildTheme({ radius: 4 }, "light").buttonRadius).toBe(4);
		expect(
			buildTheme({ radius: -1, buttonRadius: 999 }, "light"),
		).toMatchObject({ radius: 11, buttonRadius: 999 });
	});

	it("uses the bold font file for bold text when given", () => {
		const theme = buildTheme(
			{ fontFamily: "Inter_400Regular", fontFamilyBold: "Inter_600SemiBold" },
			"light",
		);
		expect(theme.font("600")).toEqual({
			fontFamily: "Inter_600SemiBold",
			fontWeight: "normal",
		});
		expect(theme.font("500")).toEqual({
			fontFamily: "Inter_400Regular",
			fontWeight: "500",
		});
		expect(buildTheme({}, "light").font("700")).toEqual({ fontWeight: "700" });
	});
});

describe("buildTheme's derived colors and title", () => {
	it("draws the chosen type from the surface colors by default", () => {
		const theme = buildTheme({ background: "#fff", text: "#111" }, "light");
		expect(theme).toMatchObject({
			selectedBg: "#fff",
			selectedFg: "#111",
			selectedIcon: theme.accent,
			selectedBorder: theme.border,
			accentEdge: null,
		});
	});

	it("takes the chosen type's colors and the edge, dark ones in dark mode", () => {
		const input = {
			selected: "#fde",
			selectedText: "#a33",
			selectedBorder: "#c53",
			accentEdge: "#a33",
			dark: { selected: "#422" },
		};
		expect(buildTheme(input, "light")).toMatchObject({
			selectedBg: "#fde",
			selectedFg: "#a33",
			selectedIcon: "#a33",
			selectedBorder: "#c53",
			accentEdge: "#a33",
		});
		expect(buildTheme(input, "dark").selectedBg).toBe("#422");
	});

	it("sets the title's font and size", () => {
		expect(buildTheme({}, "light").title).toEqual({
			fontWeight: "700",
			fontSize: 17,
		});
		expect(
			buildTheme(
				{
					fontFamilyBold: "Inter_700Bold",
					titleFontFamily: "Fraunces_600SemiBold",
					titleFontSize: 22,
				},
				"light",
			).title,
		).toEqual({
			fontFamily: "Fraunces_600SemiBold",
			fontWeight: "normal",
			fontSize: 22,
		});
		expect(
			buildTheme({ fontFamilyBold: "Inter_700Bold" }, "light").title,
		).toEqual({
			fontFamily: "Inter_700Bold",
			fontWeight: "normal",
			fontSize: 17,
		});
	});
});
