import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { state, subscribe } from "../state";

const getMasking = () => state.masking;

/**
 * Hides its content from Tattle screenshots: while the screen is captured, a
 * solid block covers it. Wrap anything that must never leave the device:
 * card numbers, personal details, tokens.
 */
export function TattleMask({
	children,
	style,
	...props
}: ViewProps & { children?: ReactNode }) {
	const masking = useSyncExternalStore(subscribe, getMasking, getMasking);
	useEffect(() => {
		state.masks++;
		return () => {
			state.masks--;
		};
	}, []);
	return (
		<View {...props} style={style}>
			{children}
			{masking && <View pointerEvents="none" style={styles.cover} />}
		</View>
	);
}

const styles = StyleSheet.create({
	cover: { ...StyleSheet.absoluteFill, backgroundColor: "#18181b" },
});
