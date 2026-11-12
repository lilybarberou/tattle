import { describe, expect, it } from "vitest";
import { arrowHead, boxOf, fitContain, isTiny, penPath } from "../src/geometry";

describe("geometry", () => {
	it("normalizes a box dragged up and to the left", () => {
		expect(boxOf({ x1: 50, y1: 80, x2: 10, y2: 20 })).toEqual({
			x: 10,
			y: 20,
			width: 40,
			height: 60,
		});
	});

	it("points the arrow head at the end of the line", () => {
		const [tip] = arrowHead(0, 0, 100, 0).split(" ");
		expect(tip).toBe("100,0");
		const [, a, b] = arrowHead(0, 0, 100, 0)
			.split(" ")
			.map((p) => p.split(",").map(Number));
		// Both corners sit behind the tip, one on each side of the line.
		expect(a?.[0]).toBeLessThan(100);
		expect(b?.[0]).toBeLessThan(100);
		expect(Math.sign(a?.[1] ?? 0)).toBe(-Math.sign(b?.[1] ?? 0));
	});

	it("draws a dot for a single pen point and a polyline otherwise", () => {
		expect(penPath([5, 5])).toBe("M5 5 L5.01 5");
		expect(penPath([0, 0, 10, 10, 20, 5])).toBe("M0 0 L10 10 L20 5");
		expect(penPath([])).toBe("");
	});

	it("ignores taps", () => {
		expect(isTiny({ tool: "rect", x1: 0, y1: 0, x2: 2, y2: 40 })).toBe(true);
		expect(isTiny({ tool: "rect", x1: 0, y1: 0, x2: 20, y2: 40 })).toBe(false);
		expect(isTiny({ tool: "arrow", x1: 0, y1: 0, x2: 30, y2: 0 })).toBe(false);
		expect(isTiny({ tool: "pen", points: [1, 1] })).toBe(true);
	});

	it("fits the screenshot in the editor without distorting it", () => {
		expect(
			fitContain({ width: 390, height: 844 }, { width: 370, height: 600 }),
		).toEqual({ width: 277, height: 600 });
		expect(
			fitContain({ width: 390, height: 844 }, { width: 0, height: 0 }),
		).toEqual({ width: 0, height: 0 });
	});
});
