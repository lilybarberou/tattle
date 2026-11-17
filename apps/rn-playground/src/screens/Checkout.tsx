import { Tattle, TattleMask } from "@tattlehq/react-native";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { usePalette } from "../theme";
import { Button, Output, Screen, Section } from "../ui";

/** A screen with data that must never leave the device, and a failing payment. */
export function CheckoutScreen() {
	const { palette } = usePalette();
	const [status, setStatus] = useState("");

	const pay = async () => {
		Tattle.addBreadcrumb({ message: "Tapped Pay", category: "checkout" });
		setStatus("Paying…");
		try {
			const response = await fetch("https://httpbin.org/status/502");
			if (!response.ok)
				throw new Error(`Payment API answered ${response.status}`);
			setStatus("Paid");
		} catch (error) {
			console.error("Payment failed", error);
			setStatus(`${(error as Error).message}. Report it with the button.`);
		}
	};

	const text = { color: palette.text };
	const muted = { color: palette.muted };

	return (
		<Screen>
			<Section title="Order">
				<Line label="Linen shirt × 2" value="€ 78.00" />
				<Line label="Delivery" value="€ 4.90" />
				<Line label="Total" value="€ 82.90" bold />
			</Section>

			<Section
				title="Payment"
				note="The yellow blocks are wrapped in <TattleMask>: screenshots show a solid block instead."
			>
				<Text style={[styles.label, muted]}>Name on card</Text>
				<TextInput
					defaultValue="Jane Doe"
					style={[styles.input, text, { borderColor: palette.border }]}
				/>
				<Text style={[styles.label, muted]}>Card number</Text>
				<TattleMask
					style={[styles.secret, { backgroundColor: palette.secret }]}
				>
					<Text style={[styles.secretText, { color: palette.secretText }]}>
						4242 4242 4242 4242 · 12/29 · 123
					</Text>
				</TattleMask>
				<Text style={[styles.label, muted]}>Refund to</Text>
				<TattleMask
					style={[styles.secret, { backgroundColor: palette.secret }]}
				>
					<Text style={[styles.secretText, { color: palette.secretText }]}>
						FR76 3000 6000 0112 3456 7890 189
					</Text>
				</TattleMask>
				<View style={styles.pay}>
					<Button primary label="Pay € 82.90" onPress={pay} />
				</View>
				<Output text={status} />
			</Section>
		</Screen>
	);
}

function Line({
	label,
	value,
	bold = false,
}: {
	label: string;
	value: string;
	bold?: boolean;
}) {
	const { palette } = usePalette();
	const style = [{ color: palette.text }, bold && styles.bold];
	return (
		<View style={styles.line}>
			<Text style={style}>{label}</Text>
			<Text style={style}>{value}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	line: { flexDirection: "row", justifyContent: "space-between" },
	bold: { fontWeight: "700" },
	label: { fontSize: 13 },
	input: {
		borderWidth: 1,
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 8,
		fontSize: 15,
	},
	secret: { borderRadius: 8, padding: 10 },
	secretText: { fontSize: 15, fontVariant: ["tabular-nums"] },
	pay: { flexDirection: "row", marginTop: 6 },
});
