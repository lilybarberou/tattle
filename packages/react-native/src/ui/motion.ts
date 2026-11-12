import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";
import type { AnimationPreset } from "../types";
import type { SheetAnimation } from "./theme";

const DEFAULT_EASING = Easing.out(Easing.cubic);

function useReduceMotion(): boolean {
	const [reduce, setReduce] = useState(false);
	useEffect(() => {
		let active = true;
		AccessibilityInfo.isReduceMotionEnabled?.()
			.then((value) => {
				if (active) setReduce(value);
			})
			.catch(() => {});
		const subscription = AccessibilityInfo.addEventListener?.(
			"reduceMotionChanged",
			setReduce,
		);
		return () => {
			active = false;
			subscription?.remove();
		};
	}, []);
	return reduce;
}

/**
 * The sheet's entrance and exit. `mounted` stays true while the exit plays,
 * so the modal must use it rather than `visible`. `progress` goes from 0
 * (hidden) to 1 (shown); the preset of the current phase (entrance while
 * visible, exit after) gives the hidden state, so switching at 1 never jumps.
 */
export function useSheetMotion(
	visible: boolean,
	animation: SheetAnimation,
	sheetHeight: number,
) {
	const reduceMotion = useReduceMotion();
	const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
	const [mounted, setMounted] = useState(visible);
	const motion = animation[visible ? "enter" : "exit"];

	useEffect(() => {
		if (visible) setMounted(true);
	}, [visible]);

	// Starts once the modal's views are mounted, so the native driver has
	// views to drive.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs when the sheet opens, closes or mounts
	useEffect(() => {
		if (!mounted) return;
		const { duration, easing, preset } = motion;
		progress.stopAnimation();
		if (preset === "none" || duration === 0) {
			progress.setValue(visible ? 1 : 0);
			if (!visible) setMounted(false);
			return;
		}
		const run = Animated.timing(progress, {
			toValue: visible ? 1 : 0,
			duration,
			easing: easing ?? DEFAULT_EASING,
			useNativeDriver: true,
		});
		run.start(({ finished }) => {
			if (finished && !visible) setMounted(false);
		});
		return () => run.stop();
	}, [visible, mounted]);

	const preset: AnimationPreset =
		reduceMotion && motion.preset !== "none" ? "fade" : motion.preset;
	const opacity =
		preset === "slide" || preset === "none" ? undefined : progress;
	const transform =
		preset === "slide"
			? [
					{
						translateY: progress.interpolate({
							inputRange: [0, 1],
							outputRange: [sheetHeight, 0],
						}),
					},
				]
			: preset === "pop"
				? [
						{
							translateY: progress.interpolate({
								inputRange: [0, 1],
								outputRange: [12, 0],
							}),
						},
						{
							scale: progress.interpolate({
								inputRange: [0, 1],
								outputRange: [0.96, 1],
							}),
						},
					]
				: undefined;

	return {
		mounted,
		backdropStyle: { opacity: preset === "none" ? undefined : progress },
		sheetStyle: { opacity, transform },
		/** The annotation editor, which has no sheet: it only fades. */
		contentStyle: { opacity: preset === "none" ? undefined : progress },
	};
}
