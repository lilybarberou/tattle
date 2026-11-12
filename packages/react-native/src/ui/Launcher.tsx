import { useEffect, useMemo, useRef } from "react";
import {
	Animated,
	PanResponder,
	StyleSheet,
	useWindowDimensions,
} from "react-native";
import type { Insets } from "../optional";
import { Icon } from "./icons";
import { useInsets } from "./insets";
import type { Theme } from "./theme";

const SIZE = 52;
const MARGIN = 12;
const TAP_SLOP = 6;

/**
 * A round button that sits on a screen edge. Users drag it up and down or to
 * the other edge when it covers something; it snaps back to the nearest edge.
 */
interface Bounds {
	width: number;
	height: number;
	insets: Insets;
}

/** Left position of the button resting on one edge. */
const edgeX = (b: Bounds, toLeft: boolean) =>
	toLeft ? MARGIN + b.insets.left : b.width - SIZE - MARGIN - b.insets.right;

/** Keeps the button between the safe area's top and bottom. */
const clampY = (b: Bounds, y: number) => {
	const top = b.insets.top + MARGIN;
	const bottom = b.height - b.insets.bottom - SIZE - MARGIN;
	return Math.min(Math.max(y, top), Math.max(top, bottom));
};

/**
 * A round button that sits on a screen edge. Users drag it up and down or to
 * the other edge when it covers something; it snaps back to the nearest edge.
 */
export function Launcher({
	side,
	label,
	theme,
	onPress,
}: {
	side: "left" | "right";
	label: string;
	theme: Theme;
	onPress: () => void;
}) {
	const { width, height } = useWindowDimensions();
	const insets = useInsets();
	const bounds = useRef<Bounds>({ width, height, insets });
	bounds.current = { width, height, insets };
	const onPressRef = useRef(onPress);
	onPressRef.current = onPress;

	const resting = useRef({
		left: side === "left",
		y: Math.round(height * 0.62),
	});
	const position = useRef(
		new Animated.ValueXY({
			x: edgeX(bounds.current, resting.current.left),
			y: clampY(bounds.current, resting.current.y),
		}),
	).current;

	// Keep the button on its edge when the window changes (rotation, split view).
	const { top, bottom, left, right } = insets;
	useEffect(() => {
		const b = { width, height, insets: { top, bottom, left, right } };
		position.setValue({
			x: edgeX(b, resting.current.left),
			y: clampY(b, resting.current.y),
		});
	}, [position, width, height, top, bottom, left, right]);

	const responder = useMemo(
		() =>
			PanResponder.create({
				onStartShouldSetPanResponder: () => true,
				onPanResponderGrant: () => {
					position.stopAnimation();
					position.setOffset({
						x: edgeX(bounds.current, resting.current.left),
						y: clampY(bounds.current, resting.current.y),
					});
					position.setValue({ x: 0, y: 0 });
				},
				onPanResponderMove: Animated.event(
					[null, { dx: position.x, dy: position.y }],
					{ useNativeDriver: false },
				),
				onPanResponderRelease: (_event, gesture) => {
					position.flattenOffset();
					const b = bounds.current;
					const tapped =
						Math.abs(gesture.dx) < TAP_SLOP && Math.abs(gesture.dy) < TAP_SLOP;
					if (!tapped) {
						const centerX =
							edgeX(b, resting.current.left) + gesture.dx + SIZE / 2;
						resting.current = {
							left: centerX < b.width / 2,
							y: clampY(b, clampY(b, resting.current.y) + gesture.dy),
						};
					}
					Animated.spring(position, {
						toValue: {
							x: edgeX(b, resting.current.left),
							y: clampY(b, resting.current.y),
						},
						useNativeDriver: false,
						friction: 7,
					}).start();
					if (tapped) onPressRef.current();
				},
				onPanResponderTerminate: () => {
					position.flattenOffset();
					position.setValue({
						x: edgeX(bounds.current, resting.current.left),
						y: clampY(bounds.current, resting.current.y),
					});
				},
			}),
		[position],
	);

	return (
		<Animated.View
			{...responder.panHandlers}
			accessible
			accessibilityRole="button"
			accessibilityLabel={label}
			onAccessibilityTap={onPress}
			style={[
				styles.button,
				{
					backgroundColor: theme.accent,
					shadowColor: theme.accent,
					transform: position.getTranslateTransform(),
				},
			]}
		>
			<Icon name="bug" color={theme.accentFg} size={24} />
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	button: {
		position: "absolute",
		left: 0,
		top: 0,
		width: SIZE,
		height: SIZE,
		borderRadius: SIZE / 2,
		alignItems: "center",
		justifyContent: "center",
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.35,
		shadowRadius: 12,
		elevation: 6,
	},
});
