import { afterEach, describe, expect, it, vi } from "vitest";
import {
	resolveScheme,
	sanitizeStrings,
	sanitizeTheme,
	themeVariables,
} from "../src/theme";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("themeVariables", () => {
	it("falls back to the page's --tattle-* variables, then to the defaults", () => {
		const vars = themeVariables({}, "light");
		expect(vars["--fb-bg"]).toBe("var(--tattle-background, #ffffff)");
		expect(vars["--fb-accent"]).toBe("var(--tattle-accent, #2f55c9)");
		expect(vars["--fb-radius"]).toBe("var(--tattle-radius, 10px)");
	});

	it("uses the dark defaults in dark mode", () => {
		expect(themeVariables({}, "dark")["--fb-bg"]).toBe(
			"var(--tattle-background, #1c1c21)",
		);
	});

	it("applies theme colors, dark overrides and accentColor", () => {
		const theme = {
			background: "#fafaf9",
			text: "#111",
			dark: { background: "#0c0a09" },
			radius: "4px",
		};
		const light = themeVariables(theme, "light", "#e11d48");
		expect(light["--fb-bg"]).toBe("#fafaf9");
		expect(light["--fb-accent"]).toBe("#e11d48");
		expect(light["--fb-radius"]).toBe("4px");
		const dark = themeVariables(theme, "dark");
		expect(dark["--fb-bg"]).toBe("#0c0a09");
		expect(dark["--fb-fg"]).toBe("#111");
	});

	it("prefers theme.accent over accentColor", () => {
		expect(
			themeVariables({ accent: "red" }, "light", "blue")["--fb-accent"],
		).toBe("red");
	});
});

describe("resolveScheme", () => {
	it("keeps an explicit scheme", () => {
		expect(resolveScheme("dark", { background: "#fff" })).toBe("dark");
	});

	it("stays light when surface colors are set for one scheme only", () => {
		expect(resolveScheme(undefined, { background: "#fff" })).toBe("light");
		expect(resolveScheme(undefined, { accent: "red" })).toBe("system");
		expect(resolveScheme(undefined, { background: "#fff", dark: {} })).toBe(
			"system",
		);
	});
});

describe("sanitizeTheme", () => {
	it("drops invalid values", () => {
		vi.stubGlobal("CSS", {
			supports: (_property: string, value: string) => value !== "nope",
		});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(
			sanitizeTheme({
				accent: "nope",
				text: "#000",
				radius: -2,
				buttonRadius: 999,
				fontFamily: "  Inter, sans-serif ",
				dark: { text: "nope", background: "#000" },
				unknown: "x",
			}),
		).toEqual({
			text: "#000",
			buttonRadius: "999px",
			fontFamily: "Inter, sans-serif",
			dark: { background: "#000" },
		});
	});

	it("accepts anything but an object as no theme", () => {
		expect(sanitizeTheme(null)).toEqual({});
		expect(sanitizeTheme("dark")).toEqual({});
	});
});

describe("sanitizeStrings", () => {
	it("keeps string values only", () => {
		expect(sanitizeStrings({ send: "Go", title: 3 })).toEqual({ send: "Go" });
	});
});
