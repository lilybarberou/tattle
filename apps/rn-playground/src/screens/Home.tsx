import { Tattle } from "@tattle/react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { apiUrl, hasProjectKey } from "../config";
import type { ScreenProps } from "../navigation";
import { usePalette } from "../theme";
import { Button, Output, Row, Screen, Section } from "../ui";

// Same public endpoints as the web widget's demo.
const HTTPBIN = "https://httpbin.org";

export function HomeScreen({ navigation }: ScreenProps<"Home">) {
	const { palette } = usePalette();
	const [consoleOut, setConsoleOut] = useState("");
	const [errorOut, setErrorOut] = useState("");
	const [networkOut, setNetworkOut] = useState("");
	const [stepOut, setStepOut] = useState("");

	const request = async (label: string, url: string) => {
		setNetworkOut(`${label}…`);
		try {
			const response = await fetch(url);
			setNetworkOut(`${label} -> ${response.status}`);
		} catch (error) {
			setNetworkOut(`${label} failed: ${(error as Error).message}`);
		}
	};

	const xhr = () => {
		const request = new XMLHttpRequest();
		request.open("GET", `${HTTPBIN}/get?via=xhr`);
		request.onload = () => setNetworkOut(`XHR /get -> ${request.status}`);
		request.onerror = () => setNetworkOut("XHR /get failed");
		request.send();
	};

	return (
		<Screen>
			{!hasProjectKey && (
				<View style={[styles.warning, { backgroundColor: palette.secret }]}>
					<Text style={{ color: palette.secretText }}>
						No project key: copy apps/rn-playground/.env.example to .env, set
						EXPO_PUBLIC_TATTLE_PROJECT_KEY, then restart Expo. Reports are
						refused until then.
					</Text>
				</View>
			)}

			<Section
				title="Report"
				note={`Tap the floating button, or open the form from here. Reports go to ${apiUrl}.`}
			>
				<Row>
					<Button primary label="Report a bug" onPress={() => Tattle.open()} />
					<Button
						label="Suggest an idea"
						onPress={() => Tattle.open({ type: "feature" })}
					/>
				</Row>
			</Section>

			<Section
				title="Screens"
				note="Each screen is a step of the next report. Open the form on another screen to see where it came from."
			>
				<Row>
					<Button
						label="Checkout (masked card)"
						onPress={() => navigation.navigate("Checkout")}
					/>
					<Button
						label="Account and settings"
						onPress={() => navigation.navigate("Account")}
					/>
				</Row>
			</Section>

			<Section
				title="Console"
				note="The last 200 calls are sent with the report, credentials scrubbed."
			>
				<Row>
					<Button
						label="console.log"
						onPress={() => {
							console.log("Cart loaded", { items: 3, total: 42.5 });
							setConsoleOut("console.log sent");
						}}
					/>
					<Button
						label="console.info"
						onPress={() => {
							console.info("Feature flag", { newCheckout: true });
							setConsoleOut("console.info sent");
						}}
					/>
					<Button
						label="console.warn"
						onPress={() => {
							console.warn("Slow render on Home", { ms: 412 });
							setConsoleOut("console.warn sent");
						}}
					/>
					<Button
						label="console.error(Error)"
						onPress={() => {
							console.error(new Error("Could not refresh the cart"));
							setConsoleOut("console.error sent");
						}}
					/>
					<Button
						label="console.debug"
						onPress={() => {
							console.debug("Render", { screen: "Home" });
							setConsoleOut("console.debug sent");
						}}
					/>
					<Button
						label="Log a secret"
						onPress={() => {
							console.log("Signed in", {
								accessToken:
									"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl",
								header: "Bearer sk_live_1234567890abcdef",
							});
							setConsoleOut("Logged a token: the report shows [redacted]");
						}}
					/>
				</Row>
				<Output text={consoleOut} />
			</Section>

			<Section
				title="Errors"
				note="Uncaught errors are recorded through React Native's global handler. In development, React Native also shows them on screen: dismiss it."
			>
				<Row>
					<Button
						label="Throw in a handler"
						onPress={() => {
							setErrorOut("Thrown: TypeError");
							throw new TypeError("Cannot read properties of undefined");
						}}
					/>
					<Button
						label="Throw later"
						onPress={() => {
							setErrorOut("Throws in a moment");
							setTimeout(() => {
								throw new Error("Timer failed after the tap");
							}, 300);
						}}
					/>
					<Button
						label="Unhandled rejection"
						onPress={() => {
							setErrorOut("Rejected a promise (recorded in release builds)");
							void Promise.reject(new Error("Sync failed"));
						}}
					/>
				</Row>
				<Output text={errorOut} />
			</Section>

			<Section
				title="Network"
				note="Method, URL, status and duration of the last 100 requests. Never bodies or headers; secret query values are redacted."
			>
				<Row>
					<Button
						label="fetch /get"
						onPress={() => request("GET /get", `${HTTPBIN}/get`)}
					/>
					<Button
						label="fetch /status/500"
						onPress={() => request("GET /status/500", `${HTTPBIN}/status/500`)}
					/>
					<Button
						label="fetch ?token=…"
						onPress={() =>
							request(
								"GET /get?token=…",
								`${HTTPBIN}/get?token=abc123&page=2&api_key=xyz`,
							)
						}
					/>
					<Button
						label="fetch unreachable host"
						onPress={() =>
							request("GET unreachable", "https://unreachable.invalid/x")
						}
					/>
					<Button label="XHR /get" onPress={xhr} />
				</Row>
				<Output text={networkOut} />
			</Section>

			<Section
				title="Steps"
				note="Your own steps, next to the screens and app state changes."
			>
				<Row>
					<Button
						label="addBreadcrumb(coupon)"
						onPress={() => {
							Tattle.addBreadcrumb({
								message: "Applied coupon",
								category: "cart",
								data: { code: "SPRING", percent: 15 },
							});
							setStepOut("Step added: Applied coupon");
						}}
					/>
				</Row>
				<Output text={stepOut} />
			</Section>
		</Screen>
	);
}

const styles = StyleSheet.create({
	warning: { borderRadius: 12, padding: 14 },
});
