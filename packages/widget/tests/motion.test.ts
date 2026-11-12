import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMotion, sanitizeAnimation } from "../src/motion";
import { sanitizeTheme } from "../src/theme";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("resolveMotion", () => {
	it("pops the panel and slides the bottom sheet by default", () => {
		const panel = resolveMotion(undefined, "enter", false);
		expect(panel).toMatchObject({ duration: 180 });
		expect(panel?.keyframes[0]).toEqual({
			opacity: 0,
			transform: "translateY(8px) scale(.98)",
		});
		const sheet = resolveMotion(undefined, "enter", true);
		expect(sheet).toMatchObject({ duration: 240 });
		expect(sheet?.keyframes[0]).toEqual({ transform: "translateY(100%)" });
	});

	it("plays a preset back to its hidden state on exit", () => {
		const exit = resolveMotion("fade", "exit", false);
		expect(exit?.keyframes).toEqual([
			{ opacity: 1, transform: "none" },
			{ opacity: 0 },
		]);
	});

	it("uses the exit's own preset, duration and easing", () => {
		const exit = resolveMotion(
			{
				enter: "pop",
				exit: "fade",
				duration: 300,
				exitDuration: 120,
				exitEasing: "ease-in",
			},
			"exit",
			false,
		);
		expect(exit).toEqual({
			keyframes: [{ opacity: 1, transform: "none" }, { opacity: 0 }],
			duration: 120,
			easing: "ease-in",
		});
		const enter = resolveMotion({ duration: 300 }, "enter", true);
		expect(enter?.duration).toBe(300);
	});

	it("plays custom entrance keyframes backwards on exit", () => {
		const enter = [
			{ opacity: 0, transform: "translateX(24px)" },
			{ opacity: 0.8, offset: 0.7 },
			{ opacity: 1 },
		];
		expect(resolveMotion({ enter }, "enter", false)?.keyframes).toBe(enter);
		expect(resolveMotion({ enter }, "exit", false)?.keyframes).toEqual([
			{ opacity: 1 },
			{ opacity: 0.8, offset: expect.closeTo(0.3) },
			{ opacity: 0, transform: "translateX(24px)" },
		]);
	});

	it("keeps custom exit keyframes as given", () => {
		const exit = [{}, { opacity: 0, transform: "translateY(-12px)" }];
		expect(
			resolveMotion({ enter: "fade", exit }, "exit", false)?.keyframes,
		).toBe(exit);
	});

	it("does not animate with 'none' or a zero duration", () => {
		expect(resolveMotion("none", "enter", false)).toBeNull();
		expect(resolveMotion("none", "exit", true)).toBeNull();
		expect(resolveMotion({ exit: "none" }, "enter", false)).not.toBeNull();
		expect(resolveMotion({ exit: "none" }, "exit", false)).toBeNull();
		expect(resolveMotion({ duration: 0 }, "enter", false)).toBeNull();
		expect(resolveMotion({ exitDuration: 0 }, "exit", false)).toBeNull();
	});
});

describe("sanitizeAnimation", () => {
	it("turns a preset or false into an entrance", () => {
		expect(sanitizeAnimation("slide")).toEqual({ enter: "slide" });
		expect(sanitizeAnimation(false)).toEqual({ enter: "none" });
		expect(sanitizeAnimation(undefined)).toBeUndefined();
	});

	it("drops invalid values with a warning", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(
			sanitizeAnimation({
				enter: "bounce",
				exit: [{ opacity: 0 }],
				duration: -1,
				exitDuration: 99999,
				easing: 42,
			}),
		).toEqual({ exit: [{ opacity: 0 }], exitDuration: 5000 });
		expect(warn).toHaveBeenCalledTimes(3);
		expect(sanitizeAnimation("zoom")).toBeUndefined();
	});

	it("is applied by sanitizeTheme", () => {
		expect(sanitizeTheme({ animation: "fade" }).animation).toEqual({
			enter: "fade",
		});
	});
});
