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
import {
	fetchReports,
	myReportsUrl,
	type ReportSummary,
	reporterHeaders,
	reporterKey,
} from "../reporter";
import { state, subscribe } from "../state";
import type { Locale, TattleOptions, TattleType } from "../types";
import { Launcher } from "./Launcher";
import { type Inbox, Panel } from "./Panel";
import { buildTheme, resolveScheme } from "./theme";

export type TattleProviderProps = TattleOptions & { children?: ReactNode };

let warned = false;

/** The reporter's reports, fetched on demand (no polling). */
function useReports(
	configured: boolean,
	projectKey: string,
	apiUrl: string,
): Inbox {
	const [reports, setReports] = useState<ReportSummary[]>([]);
	const [failed, setFailed] = useState(false);
	const refreshId = useRef(0);

	const headers = useCallback(
		async () =>
			reporterHeaders({
				projectKey,
				reporterKey: await reporterKey(projectKey, false),
				user: state.user,
			}),
		[projectKey],
	);

	const refresh = useCallback(async () => {
		if (!configured) return;
		const id = ++refreshId.current;
		const h = await headers();
		if (id !== refreshId.current) return;
		if (!h) {
			setReports([]);
			return;
		}
		try {
			const result = await fetchReports(apiUrl, h);
			if (id !== refreshId.current) return;
			setReports(Array.isArray(result?.reports) ? result.reports : []);
			setFailed(false);
		} catch {
			if (id === refreshId.current) setFailed(true);
		}
	}, [configured, apiUrl, headers]);

	const markLocalRead = useCallback((id: string) => {
		setReports((current) =>
			current.map((r) => (r.id === id ? { ...r, unread: 0 } : r)),
		);
	}, []);

	return { reports, failed, refresh, headers, markLocalRead };
}

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
	const [initialView, setInitialView] = useState<"form" | "list">("form");
	const resolvedLocale: Locale =
		locale === "fr" || locale === "en" ? locale : detectLocale();
	const t = useMemo(() => {
		const base = getStrings(resolvedLocale);
		const custom: Partial<Strings> = {};
		if (strings && typeof strings === "object")
			for (const [key, value] of Object.entries(strings))
				if (typeof value === "string" && key in base)
					custom[key as keyof Strings] = value;
		return { ...base, ...custom };
	}, [resolvedLocale, strings]);
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
		const endpoints = [ingestUrl(apiUrl), myReportsUrl(apiUrl)];
		state.ignoredUrls.push(...endpoints);
		return () => {
			for (const endpoint of endpoints) {
				const index = state.ignoredUrls.indexOf(endpoint);
				if (index !== -1) state.ignoredUrls.splice(index, 1);
			}
		};
	}, [configured, apiUrl]);

	const inbox = useReports(configured, projectKey, apiUrl);
	const { refresh } = inbox;
	const unread = inbox.reports.reduce((sum, r) => sum + (r.unread || 0), 0);
	const unreadRef = useRef(unread);
	unreadRef.current = unread;

	// "My reports": on start, when the user changes, and on each opening.
	useEffect(() => {
		if (!configured) return;
		let version = state.identityVersion;
		void refresh();
		return subscribe(() => {
			if (state.identityVersion === version) return;
			version = state.identityVersion;
			void refresh();
		});
	}, [configured, refresh]);

	const show = useCallback(
		(requested: TattleType | undefined) => {
			if (requested) setType(requested);
			// The team replied: open on the conversations.
			setInitialView(!requested && unreadRef.current > 0 ? "list" : "form");
			setOpen(true);
			void refresh();
		},
		[refresh],
	);

	// Tattle.open() and Tattle.close(), including calls made before mounting.
	useEffect(() => {
		if (!configured) return;
		const handle = () => {
			if (state.openRequest) {
				const requested = state.openRequest.type;
				state.openRequest = null;
				show(requested);
			} else if (state.closeRequested) {
				state.closeRequested = false;
				setOpen(false);
			}
		};
		handle();
		return subscribe(handle);
	}, [configured, show]);

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
					label={
						unread > 0
							? `${t.launcher}, ${t.unreadReplies}: ${unread}`
							: t.launcher
					}
					theme={theme}
					unread={unread}
					onPress={() => show(undefined)}
				/>
			)}
			{configured && (
				<Panel
					visible={open}
					initialType={type}
					initialView={initialView}
					config={{ projectKey, apiUrl, app, release }}
					locale={resolvedLocale}
					inbox={inbox}
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
