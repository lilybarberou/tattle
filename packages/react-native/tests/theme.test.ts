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
