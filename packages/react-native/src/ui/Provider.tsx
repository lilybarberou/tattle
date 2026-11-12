import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import { captureView, type ViewRef } from "../capture";
import { detectLocale, getStrings, type Strings } from "../i18n";
import { ingestUrl } from "../payload";
import { state, subscribe } from "../state";
import type { TattleOptions, TattleType } from "../types";
import { Launcher } from "./Launcher";
import { Panel } from "./Panel";
import { buildTheme, resolveScheme } from "./theme";

export type TattleProviderProps = TattleOptions & { children?: ReactNode };

let warned = false;

/**
 * Wrap your app with it, as high as possible (around your navigation): what
 * it wraps is what screenshots show. It adds the floating button and the
 * feedback form.
 */
export function TattleProvider({
	children,
	projectKey,
	apiUrl,
	showButton = true,
	buttonSide = "right",
	locale,
	accentColor,
	theme: themeInput,
	colorScheme,
	strings,
	backgroundColor,
	app,
	release,
}: TattleProviderProps) {
	const systemScheme = useColorScheme();
	const scheme = resolveScheme(colorScheme, themeInput, systemScheme);
	const rootRef: ViewRef = useRef(null);
	const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
	const [open, setOpen] = useState(false);
	const [type, setType] = useState<TattleType>("bug");
	const t = useMemo(() => {
		const base = getStrings(
			locale === "fr" || locale === "en" ? locale : detectLocale(),
		);
		const custom: Partial<Strings> = {};
		if (strings && typeof strings === "object")
			for (const [key, value] of Object.entries(strings))
				if (typeof value === "string" && key in base)
					custom[key as keyof Strings] = value;
		return { ...base, ...custom };
	}, [locale, strings]);
	const theme = useMemo(
		() => buildTheme(themeInput, scheme, accentColor || undefined),
		[themeInput, scheme, accentColor],
	);
	const configured =
		typeof projectKey === "string" &&
		projectKey !== "" &&
		typeof apiUrl === "string" &&
		/^https?:\/\//.test(apiUrl);

	if (!configured && !warned) {
		warned = true;
		console.error(
			"[tattle] TattleProvider needs `projectKey` and an `apiUrl` starting with http:// or https://",
		);
	}

	// The SDK's own requests stay out of the network log.
	useEffect(() => {
		if (!configured) return;
		const endpoint = ingestUrl(apiUrl);
		state.ignoredUrls.push(endpoint);
		return () => {
			const index = state.ignoredUrls.indexOf(endpoint);
			if (index !== -1) state.ignoredUrls.splice(index, 1);
		};
	}, [configured, apiUrl]);

	// Tattle.open() and Tattle.close(), including calls made before mounting.
	useEffect(() => {
		if (!configured) return;
		const handle = () => {
			if (state.openRequest) {
				const requested = state.openRequest.type;
				state.openRequest = null;
				if (requested) setType(requested);
				setOpen(true);
			} else if (state.closeRequested) {
				state.closeRequested = false;
				setOpen(false);
			}
		};
		handle();
		return subscribe(handle);
	}, [configured]);

	const captureScreen = useCallback(() => captureView(rootRef), []);
	const close = useCallback(() => setOpen(false), []);

	return (
		<View style={styles.fill}>
			<View
				ref={rootRef}
				collapsable={false}
				// Screenshots are JPEGs: without an opaque background, whatever
				// the app leaves transparent comes out black.
				style={[
					styles.fill,
					{
						backgroundColor:
							backgroundColor ?? (scheme === "dark" ? "#000000" : "#ffffff"),
					},
				]}
				onLayout={(e) =>
					setScreenSize({
						width: e.nativeEvent.layout.width,
						height: e.nativeEvent.layout.height,
					})
				}
			>
				{children}
			</View>
			{configured && showButton && !open && (
				<Launcher
					side={buttonSide}
					label={t.launcher}
					theme={theme}
					onPress={() => setOpen(true)}
				/>
			)}
			{configured && (
				<Panel
					visible={open}
					initialType={type}
					config={{ projectKey, apiUrl, app, release }}
					t={t}
					theme={theme}
					captureScreen={captureScreen}
					screenSize={screenSize}
					onClose={close}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	fill: { flex: 1 },
});
