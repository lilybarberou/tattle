import { Tattle } from "@tattlehq/react-native";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { apiUrl, hasProjectKey, projectKey } from "../config";
import { useSettings } from "../settings";
import { usePalette } from "../theme";
import { Button, Output, Row, Screen, Section } from "../ui";

/**
 * A settings screen, where apps often put "Help & feedback": the automatic
 * screenshot then shows this screen, and "Replace with an image" is the way to
 * attach the screen with the bug.
 */
export function AccountScreen() {
	const { palette } = usePalette();
	const { settings, update } = useSettings();
	const [userOut, setUserOut] = useState("");

	return (
		<Screen>
			<Section
				title="Help & feedback"
				note="Opens the form from here, the way an app without the floating button would."
			>
				<Row>
					<Button
						primary
						label="Report a problem"
						onPress={() => Tattle.open()}
					/>
					<Button
						label="Suggest an idea"
						onPress={() => Tattle.open({ type: "feature" })}
					/>
				</Row>
			</Section>

			<Section
				title="User"
				note="Reports say who sent them; extra keys become traits. The context is attached to every report."
			>
				<Row>
					<Button
						label="identify(Jane)"
						onPress={() => {
							Tattle.identify({
								id: "user_42",
								email: "jane@example.com",
								name: "Jane Doe",
								plan: "pro",
							});
							setUserOut("Signed in as Jane Doe (user_42)");
						}}
					/>
					<Button
						label="identify(null)"
						onPress={() => {
							Tattle.identify(null);
							setUserOut("Signed out");
						}}
					/>
					<Button
						label='setContext({ tenant: "acme" })'
						onPress={() => {
							Tattle.setContext({ tenant: "acme", cart: 3 });
							setUserOut("Context set: tenant acme, cart 3");
						}}
					/>
				</Row>
				<Output text={userOut} />
			</Section>

			<Section title="Widget language" note="Default: the device's language.">
				<Row>
					<Button
						label="Device"
						selected={settings.locale === undefined}
						onPress={() => update({ locale: undefined })}
					/>
					<Button
						label="English"
						selected={settings.locale === "en"}
						onPress={() => update({ locale: "en" })}
					/>
					<Button
						label="Français"
						selected={settings.locale === "fr"}
						onPress={() => update({ locale: "fr" })}
					/>
				</Row>
			</Section>

			<Section title="Color scheme">
				<Row>
					{(["system", "light", "dark"] as const).map((scheme) => (
						<Button
							key={scheme}
							label={scheme[0]?.toUpperCase() + scheme.slice(1)}
							selected={settings.colorScheme === scheme}
							onPress={() => update({ colorScheme: scheme })}
						/>
					))}
				</Row>
			</Section>

			<Section title="Floating button">
				<Row>
					<Button
						label={settings.showButton ? "Hide it" : "Show it"}
						onPress={() => update({ showButton: !settings.showButton })}
					/>
					<Button
						label={`Start on the ${settings.buttonSide === "right" ? "left" : "right"}`}
						onPress={() =>
							update({
								buttonSide: settings.buttonSide === "right" ? "left" : "right",
							})
						}
					/>
				</Row>
			</Section>

			<Section title="Server">
				<Text style={[styles.mono, { color: palette.text }]} selectable>
					{apiUrl}
				</Text>
				<Text
					style={[
						styles.mono,
						{ color: hasProjectKey ? palette.muted : palette.danger },
					]}
					selectable
				>
					{hasProjectKey ? projectKey : "No project key in .env"}
				</Text>
			</Section>
		</Screen>
	);
}

const styles = StyleSheet.create({
	mono: { fontSize: 13 },
});
