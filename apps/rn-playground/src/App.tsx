import {
	DarkTheme,
	DefaultTheme,
	NavigationContainer,
	useNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Tattle, TattleProvider } from "@tattlehq/react-native";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { apiUrl, projectKey } from "./config";
import type { Routes } from "./navigation";
import { AccountScreen } from "./screens/Account";
import { CheckoutScreen } from "./screens/Checkout";
import { HomeScreen } from "./screens/Home";
import { defaultSettings, type Settings, SettingsContext } from "./settings";
import { usePalette } from "./theme";

const Stack = createNativeStackNavigator<Routes>();

const app = {
	name: "Tattle playground",
	version: Constants.expoConfig?.version ?? "1.0.0",
	build: "dev",
};

export function App() {
	const [settings, setSettings] = useState<Settings>(defaultSettings);
	const update = useCallback(
		(change: Partial<Settings>) =>
			setSettings((current) => ({ ...current, ...change })),
		[],
	);
	const value = useMemo(() => ({ settings, update }), [settings, update]);

	return (
		<SafeAreaProvider>
			<SettingsContext value={value}>
				{/* What the provider wraps is what screenshots show. */}
				<TattleProvider
					projectKey={projectKey}
					apiUrl={apiUrl}
					app={app}
					locale={settings.locale}
					colorScheme={settings.colorScheme}
					showButton={settings.showButton}
					buttonSide={settings.buttonSide}
				>
					<Navigation />
				</TattleProvider>
			</SettingsContext>
		</SafeAreaProvider>
	);
}

function Navigation() {
	const navigationRef = useNavigationContainerRef<Routes>();
	const { palette, dark } = usePalette();
	const [stopTracking, setStopTracking] = useState<(() => void) | null>(null);
	useEffect(() => () => stopTracking?.(), [stopTracking]);

	const theme = useMemo(() => {
		const base = dark ? DarkTheme : DefaultTheme;
		return {
			...base,
			colors: {
				...base.colors,
				primary: palette.accent,
				background: palette.background,
				card: palette.card,
				text: palette.text,
				border: palette.border,
			},
		};
	}, [dark, palette]);

	return (
		<NavigationContainer
			ref={navigationRef}
			theme={theme}
			// Each screen becomes a step of the next report, and its "page".
			onReady={() =>
				setStopTracking(() => Tattle.trackNavigation(navigationRef))
			}
		>
			<StatusBar style={dark ? "light" : "dark"} />
			<Stack.Navigator>
				<Stack.Screen
					name="Home"
					component={HomeScreen}
					options={{ title: "Tattle playground" }}
				/>
				<Stack.Screen name="Checkout" component={CheckoutScreen} />
				<Stack.Screen name="Account" component={AccountScreen} />
			</Stack.Navigator>
		</NavigationContainer>
	);
}
