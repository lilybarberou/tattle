import type { ReactNode } from "react";
import {
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { usePalette } from "./theme";

export function Screen({ children }: { children: ReactNode }) {
	const { palette } = usePalette();
	return (
		<ScrollView
			style={{ backgroundColor: palette.background }}
			contentContainerStyle={styles.screen}
			contentInsetAdjustmentBehavior="automatic"
		>
			{children}
		</ScrollView>
	);
}

export function Section({
	title,
	note,
	children,
}: {
	title: string;
	note?: string;
	children: ReactNode;
}) {
	const { palette } = usePalette();
	return (
		<View
			style={[
				styles.section,
				{ backgroundColor: palette.card, borderColor: palette.border },
			]}
		>
			<Text style={[styles.title, { color: palette.text }]}>{title}</Text>
			{note ? (
				<Text style={[styles.note, { color: palette.muted }]}>{note}</Text>
			) : null}
			{children}
		</View>
	);
}

export function Row({ children }: { children: ReactNode }) {
	return <View style={styles.row}>{children}</View>;
}

export function Button({
	label,
	onPress,
	selected = false,
	primary = false,
}: {
	label: string;
	onPress: () => void;
	selected?: boolean;
	primary?: boolean;
}) {
	const { palette } = usePalette();
	const filled = primary || selected;
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityState={{ selected }}
			style={({ pressed }) => [
				styles.button,
				{
					borderColor: filled ? palette.accent : palette.border,
					backgroundColor: filled ? palette.accent : palette.card,
					opacity: pressed ? 0.6 : 1,
				},
			]}
		>
			<Text
				style={[
					styles.buttonText,
					{ color: filled ? "#ffffff" : palette.text },
				]}
			>
				{label}
			</Text>
		</Pressable>
	);
}

/** One line under a section, saying what the last button did. */
export function Output({ text }: { text: string }) {
	const { palette } = usePalette();
	if (!text) return null;
	return (
		<Text style={[styles.output, { color: palette.muted }]} selectable>
			{text}
		</Text>
	);
}

const styles = StyleSheet.create({
	screen: { padding: 16, gap: 16, paddingBottom: 120 },
	section: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		padding: 16,
		gap: 10,
	},
	title: { fontSize: 16, fontWeight: "600" },
	note: { fontSize: 14, lineHeight: 20 },
	row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	button: {
		borderWidth: 1,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	buttonText: { fontSize: 14, fontWeight: "500" },
	output: {
		fontSize: 12,
		fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
	},
});
