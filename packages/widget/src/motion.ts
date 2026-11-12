import type { AnimationPreset, TattleAnimation } from "./types";

/** What the panel plays when it appears or disappears. */
export interface Motion {
	keyframes: Keyframe[];
	duration: number;
	easing: string;
}

const PRESETS: AnimationPreset[] = ["pop", "slide", "fade", "none"];
const EASING = "cubic-bezier(.2, .8, .3, 1)";
const DURATION = { panel: 180, sheet: 240 };
const MAX_DURATION = 5000;

/** The hidden state of each preset; the panel animates from it, and back to it. */
function hiddenState(
	preset: Exclude<AnimationPreset, "none">,
	sheet: boolean,
): Keyframe {
	switch (preset) {
		case "fade":
			return { opacity: 0 };
		case "slide":
			return sheet
				? { transform: "translateY(100%)" }
				: { opacity: 0, transform: "translateY(16px)" };
		default:
			return { opacity: 0, transform: "translateY(8px) scale(.98)" };
	}
}
const SHOWN: Keyframe = { opacity: 1, transform: "none" };

export function isPreset(value: unknown): value is AnimationPreset {
	return PRESETS.includes(value as AnimationPreset);
}

function supportsEasing(value: string): boolean {
	try {
		return typeof CSS === "undefined" || !CSS.supports
			? true
			: CSS.supports("transition-timing-function", value);
	} catch {
		return false;
	}
}

function keyframes(value: unknown): Keyframe[] | undefined {
	if (!Array.isArray(value) || value.length === 0) return undefined;
	if (!value.every((frame) => frame && typeof frame === "object"))
		return undefined;
	return value.map((frame) => ({ ...frame }));
}

function animationStep(
	value: unknown,
): AnimationPreset | Keyframe[] | undefined {
	return isPreset(value) ? value : keyframes(value);
}

/** Keeps the valid parts of `theme.animation` from untrusted input. */
export function sanitizeAnimation(input: unknown): TattleAnimation | undefined {
	if (isPreset(input)) return { enter: input };
	if (input === false) return { enter: "none" };
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		if (input !== undefined)
			console.warn("[tattle] ignoring invalid theme.animation:", input);
		return undefined;
	}
	const raw = input as Record<string, unknown>;
	const out: TattleAnimation = {};
	for (const key of ["enter", "exit"] as const) {
		if (raw[key] === undefined) continue;
		const step = animationStep(raw[key]);
		if (step) out[key] = step;
		else
			console.warn(
				`[tattle] ignoring invalid theme.animation.${key}:`,
				raw[key],
			);
	}
	for (const key of ["duration", "exitDuration"] as const) {
		if (raw[key] === undefined) continue;
		const value = raw[key];
		if (typeof value === "number" && Number.isFinite(value) && value >= 0)
			out[key] = Math.min(value, MAX_DURATION);
		else
			console.warn(`[tattle] ignoring invalid theme.animation.${key}:`, value);
	}
	for (const key of ["easing", "exitEasing"] as const) {
		if (raw[key] === undefined) continue;
		const value = raw[key];
		if (typeof value === "string" && value.trim() && supportsEasing(value))
			out[key] = value.trim();
		else
			console.warn(`[tattle] ignoring invalid theme.animation.${key}:`, value);
	}
	return out;
}

/**
 * The animation for the panel's entrance or exit, or null for none. `sheet` is
 * true on small screens, where the panel is a bottom sheet.
 */
export function resolveMotion(
	input: AnimationPreset | TattleAnimation | undefined,
	phase: "enter" | "exit",
	sheet: boolean,
): Motion | null {
	const animation = typeof input === "string" ? { enter: input } : input;
	const enter = animation?.enter ?? (sheet ? "slide" : "pop");
	const step = phase === "exit" ? (animation?.exit ?? enter) : enter;
	const duration =
		animation?.duration ?? (sheet ? DURATION.sheet : DURATION.panel);
	const easing = animation?.easing ?? EASING;
	const timing =
		phase === "exit"
			? {
					duration: animation?.exitDuration ?? duration,
					easing: animation?.exitEasing ?? easing,
				}
			: { duration, easing };
	if (step === "none" || timing.duration === 0) return null;
	let frames: Keyframe[];
	if (typeof step === "string") {
		const hidden = hiddenState(step, sheet);
		frames = phase === "exit" ? [SHOWN, hidden] : [hidden, SHOWN];
	} else if (phase === "exit" && animation?.exit === undefined) {
		// Exit without its own animation: the entrance, played backwards.
		frames = [...step]
			.reverse()
			.map((frame) =>
				typeof frame.offset === "number"
					? { ...frame, offset: 1 - frame.offset }
					: frame,
			);
	} else frames = step;
	return { keyframes: frames, ...timing };
}
