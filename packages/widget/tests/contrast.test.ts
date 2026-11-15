import { describe, expect, it } from "vitest";
import { themeVariables } from "../src/theme";
import { styles } from "../src/ui/styles";

// WCAG 2 contrast of the text above the reporter's own messages ("You · 2h")
// on their tinted bubble, computed from the stylesheet's own color-mix()
// percentages and the default palettes, for a range of accent colors.

type Rgb = [number, number, number];
const hex = (value: string): Rgb => {
	const h = value.replace("#", "");
	return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
};
const mix = (a: Rgb, b: Rgb, share: number): Rgb =>
	a.map((v, i) => v * share + (b[i] as number) * (1 - share)) as Rgb;
const luminance = (color: Rgb) => {
	const [r, g, b] = color.map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as Rgb;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
		number,
		number,
	];
	return (hi + 0.05) / (lo + 0.05);
};
/** The default behind `var(--tattle-…, #xxxxxx)`. */
const fallback = (variable: string | undefined) =>
	hex(/#[0-9a-f]{6}/i.exec(variable ?? "")?.[0] ?? "");
const percent = (pattern: RegExp) => Number(pattern.exec(styles)?.[1]) / 100;

describe("the reporter's own messages", () => {
	const bubbleAccent = percent(
		/\.fb-msg-mine \{[^}]*var\(--fb-accent\) (\d+)%, var\(--fb-bg\)/,
	);
	const metaMuted = percent(
		/\.fb-msg-mine \.fb-msg-meta \{ color: color-mix\(in srgb, var\(--fb-muted\) (\d+)%, var\(--fb-fg\)\)/,
	);

	it("are styled as this test assumes", () => {
		expect(bubbleAccent).toBe(0.12);
		expect(metaMuted).toBe(0.8);
	});

	for (const scheme of ["light", "dark"] as const) {
		it(`keep their header text at 4.5:1 or more (${scheme})`, () => {
			for (const accent of [
				"#2f55c9",
				"#e11d48",
				"#16a34a",
				"#f59e0b",
				"#7c3aed",
				"#0ea5e9",
				"#000000",
				"#ffd400",
			]) {
				const vars = themeVariables({ accent }, scheme);
				const bg = fallback(vars["--fb-bg"]);
				const bubble = mix(hex(accent), bg, bubbleAccent);
				const meta = mix(
					fallback(vars["--fb-muted"]),
					fallback(vars["--fb-fg"]),
					metaMuted,
				);
				expect(contrast(meta, bubble), accent).toBeGreaterThanOrEqual(4.5);
			}
		});
	}
});
