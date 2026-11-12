import { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Animated,
	Image,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	useWindowDimensions,
	View,
} from "react-native";
import type { Strings } from "../i18n";
import {
	buildPayload,
	IngestError,
	MAX_MESSAGE_LENGTH,
	sendPayload,
} from "../payload";
import { type ReportSummary, reporterKey } from "../reporter";
import { state } from "../state";
import type { AppInfo, Locale, TattleType } from "../types";
import { type Annotation, Annotator } from "./Annotator";
import { ReportList, ReportsEntry, ThreadScreen } from "./Inbox";
import { Icon } from "./icons";
import { useInsets } from "./insets";
import { useSheetMotion } from "./motion";
import { offset, type Theme } from "./theme";

const SUCCESS_CLOSE_MS = 2500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Shot {
	/** The raw capture, kept to annotate again from scratch. */
	uri: string;
	/** What is sent: the capture, or the annotated copy. */
	dataUrl: string;
	annotation: Annotation | null;
}

export interface PanelConfig {
	projectKey: string;
	apiUrl: string;
	app?: AppInfo | undefined;
	release?: string | undefined;
}

/** "My reports", kept by the provider so the launcher can show the unread badge. */
export interface Inbox {
	reports: ReportSummary[];
	failed: boolean;
	refresh: () => Promise<void>;
	headers: () => Promise<Record<string, string> | null>;
	markLocalRead: (id: string) => void;
}

/**
 * The feedback form in a modal: bug or idea, screenshot, message and email.
 * For bugs, the screen under the modal is captured as it opens and attached;
 * users can annotate or remove it.
 */
export function Panel({
	visible,
	initialType,
	initialView,
	config,
	locale,
	inbox,
	t,
	theme,
	captureScreen,
	screenSize,
	onClose,
}: {
	visible: boolean;
	initialType: TattleType;
	/** "list" opens on "My reports" (the team replied). */
	initialView: "form" | "list";
	config: PanelConfig;
	locale: Locale;
	inbox: Inbox;
	t: Strings;
	theme: Theme;
	captureScreen: () => Promise<string>;
	screenSize: { width: number; height: number };
	onClose: () => void;
}) {
	const insets = useInsets();
	const window = useWindowDimensions();
	const [view, setView] = useState<
		"form" | "editor" | "success" | "list" | "thread"
	>("form");
	const [threadId, setThreadId] = useState<string | null>(null);
	const unread = inbox.reports.reduce((sum, r) => sum + (r.unread || 0), 0);
	const [type, setType] = useState<TattleType>(initialType);
	const [shot, setShot] = useState<Shot | null>(null);
	const [capturing, setCapturing] = useState(false);
	const [captureFailed, setCaptureFailed] = useState(false);
	const [message, setMessage] = useState("");
	const [email, setEmail] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const lastCapture = useRef<string | null>(null);
	const openId = useRef(0);
	const [sheetHeight, setSheetHeight] = useState(window.height);
	const motion = useSheetMotion(visible, theme.animation, sheetHeight);

	const capture = async (id: number) => {
		setCapturing(true);
		setCaptureFailed(false);
		try {
			const uri = await captureScreen();
			if (openId.current !== id) return;
			lastCapture.current = uri;
			setShot({ uri, dataUrl: uri, annotation: null });
		} catch {
			if (openId.current === id) setCaptureFailed(true);
		} finally {
			if (openId.current === id) setCapturing(false);
		}
	};

	// Each opening starts from the current screen: a new capture, a fresh form
	// after a sent report, the draft message otherwise.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs when the modal opens
	useEffect(() => {
		if (!visible) return;
		const id = ++openId.current;
		setType(initialType);
		setView(initialView);
		setThreadId(null);
		setError(null);
		setShot(null);
		lastCapture.current = null;
		void capture(id);
	}, [visible, initialType, initialView]);

	// Close on its own a moment after a report was sent.
	useEffect(() => {
		if (view !== "success") return;
		const timer = setTimeout(onClose, SUCCESS_CLOSE_MS);
		return () => clearTimeout(timer);
	}, [view, onClose]);

	const userEmail =
		typeof state.user?.email === "string" && state.user.email.trim() !== "";

	const submit = async () => {
		if (sending) return;
		const text = message.trim();
		if (!text) return setError(t.emptyMessage);
		const typed = email.trim();
		if (!userEmail && typed && !EMAIL_RE.test(typed))
			return setError(t.invalidEmail);
		setError(null);
		setSending(true);
		try {
			await sendPayload(
				config.apiUrl,
				buildPayload({
					projectKey: config.projectKey,
					type,
					message: text,
					screenshot: shot?.dataUrl,
					email: userEmail ? undefined : typed,
					user: state.user,
					context: state.context,
					screen: state.screen,
					app: config.app,
					release: config.release,
					reporterKey: await reporterKey(config.projectKey, true),
				}),
			);
			setMessage("");
			setEmail("");
			setShot(null);
			setView("success");
			// "My reports" appears with this first report.
			void inbox.refresh();
		} catch (err) {
			setError(
				err instanceof IngestError && err.status === 0
					? t.networkError
					: (err instanceof Error && err.message) || t.genericError,
			);
		} finally {
			setSending(false);
		}
	};

	const back = () => {
		if (view === "thread") setView("list");
		else setView("form");
	};

	// Android's back button steps back before it closes.
	const close = () => {
		if (view === "editor" || view === "list" || view === "thread") back();
		else onClose();
	};

	const inboxView = view === "list" || view === "thread";

	const shotSize =
		screenSize.width > 0
			? screenSize
			: { width: window.width, height: window.height };

	return (
		<Modal
			visible={motion.mounted}
			transparent
			animationType="none"
			statusBarTranslucent
			navigationBarTranslucent
			onRequestClose={close}
			supportedOrientations={["portrait", "landscape"]}
		>
			{view === "editor" && shot ? (
				<Animated.View style={[styles.editor, motion.contentStyle]}>
					<Annotator
						uri={shot.uri}
						imageSize={shotSize}
						initial={shot.annotation}
						t={t}
						theme={theme}
						onCancel={() => setView("form")}
						onDone={({ dataUrl, annotation }) => {
							setShot({ ...shot, dataUrl, annotation });
							setView("form");
						}}
					/>
				</Animated.View>
			) : (
				<KeyboardAvoidingView
					// The sheet shrinks (its content scrolls) to stay below the
					// status bar when the keyboard is open.
					style={[styles.fill, { paddingTop: insets.top + 12 }]}
					behavior={Platform.OS === "ios" ? "padding" : undefined}
				>
					<Animated.View
						style={[StyleSheet.absoluteFill, motion.backdropStyle]}
					>
						<Pressable
							style={[
								StyleSheet.absoluteFill,
								{ backgroundColor: theme.backdrop },
							]}
							onPress={onClose}
							accessibilityLabel={t.close}
							accessibilityRole="button"
						/>
					</Animated.View>
					<Animated.View
						onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
						style={[
							motion.sheetStyle,
							styles.sheet,
							{
								backgroundColor: theme.bg,
								borderTopLeftRadius: theme.radius + 7,
								borderTopRightRadius: theme.radius + 7,
								paddingBottom: Math.max(insets.bottom, 16),
							},
						]}
						accessibilityViewIsModal
					>
						<View style={[styles.grabber, { backgroundColor: theme.border }]} />
						<View style={styles.header}>
							<View style={styles.headerStart}>
								{inboxView && (
									<Pressable
										onPress={back}
										hitSlop={8}
										accessibilityRole="button"
										accessibilityLabel={t.back}
										style={[
											styles.iconButton,
											styles.backButton,
											{ borderRadius: offset(theme.buttonRadius, -2) },
										]}
									>
										<Icon name="back" color={theme.fg} />
									</Pressable>
								)}
								<Text
									style={[styles.title, theme.title, { color: theme.fg }]}
									accessibilityRole="header"
								>
									{inboxView ? t.myReports : t.title}
								</Text>
							</View>
							<Pressable
								onPress={onClose}
								hitSlop={8}
								accessibilityRole="button"
								accessibilityLabel={t.close}
								style={[
									styles.iconButton,
									{ borderRadius: offset(theme.buttonRadius, -2) },
								]}
							>
								<Icon name="close" color={theme.muted} />
							</Pressable>
						</View>

						{view === "success" ? (
							<View style={styles.success}>
								<View style={styles.successIcon}>
									<View
										style={[
											StyleSheet.absoluteFill,
											styles.successTint,
											{ backgroundColor: theme.accent },
										]}
									/>
									<Icon name="check" color={theme.accent} size={26} />
								</View>
								<Text
									style={[
										styles.successText,
										theme.font("600"),
										{ color: theme.fg },
									]}
									accessibilityLiveRegion="polite"
								>
									{t.success}
								</Text>
							</View>
						) : inboxView ? (
							<ScrollView
								style={styles.scroll}
								contentContainerStyle={styles.body}
								keyboardShouldPersistTaps="handled"
								bounces={false}
							>
								{view === "thread" && threadId ? (
									<ThreadScreen
										t={t}
										theme={theme}
										locale={locale}
										apiUrl={config.apiUrl}
										headers={inbox.headers}
										reportId={threadId}
										unread={
											(inbox.reports.find((r) => r.id === threadId)?.unread ??
												0) > 0
										}
										onRead={() => inbox.markLocalRead(threadId)}
									/>
								) : (
									<ReportList
										t={t}
										theme={theme}
										locale={locale}
										reports={inbox.reports}
										failed={inbox.failed}
										onOpen={(id) => {
											setThreadId(id);
											setView("thread");
										}}
									/>
								)}
							</ScrollView>
						) : (
							<ScrollView
								style={styles.scroll}
								contentContainerStyle={styles.body}
								keyboardShouldPersistTaps="handled"
								bounces={false}
							>
								{inbox.reports.length > 0 && (
									<ReportsEntry
										t={t}
										theme={theme}
										unread={unread}
										onPress={() => {
											setView("list");
											void inbox.refresh();
										}}
									/>
								)}
								<View
									style={[
										styles.segment,
										{
											backgroundColor: theme.subtle,
											borderRadius: theme.buttonRadius + 1,
										},
									]}
									accessibilityRole="tablist"
								>
									{(["bug", "feature"] as const).map((option) => {
										const active = type === option;
										return (
											<Pressable
												key={option}
												onPress={() => setType(option)}
												accessibilityRole="tab"
												accessibilityState={{ selected: active }}
												style={[
													styles.segmentButton,
													{ borderRadius: offset(theme.buttonRadius, -2) },
													active && {
														backgroundColor: theme.selectedBg,
														borderColor: theme.selectedBorder,
													},
												]}
											>
												<Icon
													name={option === "bug" ? "bug" : "idea"}
													color={active ? theme.selectedIcon : theme.muted}
													size={18}
												/>
												<Text
													style={[
														styles.segmentText,
														theme.font("600"),
														{ color: active ? theme.selectedFg : theme.muted },
													]}
												>
													{option === "bug" ? t.bug : t.feature}
												</Text>
											</Pressable>
										);
									})}
								</View>

								{type === "bug" &&
									(shot ? (
										<View
											style={[
												styles.shot,
												{
													borderColor: theme.border,
													borderRadius: theme.radius + 2,
												},
											]}
										>
											<Pressable
												onPress={() => setView("editor")}
												accessibilityRole="imagebutton"
												accessibilityLabel={`${t.screenshotAlt}. ${t.editShot}`}
											>
												<Image
													source={{ uri: shot.dataUrl }}
													style={[
														styles.thumb,
														{
															borderRadius: offset(theme.radius, -4),
															borderColor: theme.border,
															backgroundColor: theme.subtle,
														},
													]}
													resizeMode="cover"
												/>
											</Pressable>
											<View style={styles.shotActions}>
												<SmallButton
													icon="edit"
													label={t.editShot}
													theme={theme}
													onPress={() => setView("editor")}
												/>
												<SmallButton
													icon="trash"
													label={t.removeShot}
													theme={theme}
													danger
													onPress={() => setShot(null)}
												/>
											</View>
										</View>
									) : (
										<View style={styles.field}>
											<Pressable
												onPress={() => {
													if (lastCapture.current) {
														const uri = lastCapture.current;
														setShot({ uri, dataUrl: uri, annotation: null });
													} else void capture(openId.current);
												}}
												disabled={capturing}
												accessibilityRole="button"
												style={[
													styles.capture,
													{
														borderColor: theme.border,
														borderRadius: theme.radius,
													},
												]}
											>
												{capturing ? (
													<ActivityIndicator
														size="small"
														color={theme.accent}
													/>
												) : (
													<Icon name="camera" color={theme.accent} />
												)}
												<Text
													style={[
														styles.captureText,
														theme.font("500"),
														{ color: theme.fg },
													]}
												>
													{capturing ? t.capturing : t.capture}
												</Text>
											</Pressable>
											<Text
												style={[
													styles.hint,
													theme.font("400"),
													{ color: captureFailed ? theme.danger : theme.muted },
												]}
											>
												{captureFailed ? t.captureFailed : t.captureHint}
											</Text>
										</View>
									))}

								<View style={styles.field}>
									<Text
										style={[
											styles.label,
											theme.font("600"),
											{ color: theme.fg },
										]}
									>
										{type === "bug" ? t.messageLabelBug : t.messageLabelFeature}
									</Text>
									<TextInput
										testID="tattle-message"
										value={message}
										onChangeText={(value) => {
											setMessage(value);
											if (error) setError(null);
										}}
										placeholder={
											type === "bug" ? t.placeholderBug : t.placeholderFeature
										}
										placeholderTextColor={theme.muted}
										multiline
										maxLength={MAX_MESSAGE_LENGTH}
										textAlignVertical="top"
										accessibilityLabel={
											type === "bug" ? t.messageLabelBug : t.messageLabelFeature
										}
										style={[
											styles.input,
											styles.textarea,
											theme.font("400"),
											{
												borderRadius: theme.radius,
												color: theme.fg,
												borderColor: theme.border,
												backgroundColor: theme.bg,
											},
										]}
									/>
								</View>

								{!userEmail && (
									<View style={styles.field}>
										<Text
											style={[
												styles.label,
												theme.font("600"),
												{ color: theme.fg },
											]}
										>
											{t.emailLabel}
										</Text>
										<TextInput
											testID="tattle-email"
											value={email}
											onChangeText={setEmail}
											placeholder={t.emailPlaceholder}
											placeholderTextColor={theme.muted}
											keyboardType="email-address"
											autoCapitalize="none"
											autoCorrect={false}
											autoComplete="email"
											textContentType="emailAddress"
											accessibilityLabel={t.emailLabel}
											style={[
												styles.input,
												theme.font("400"),
												{
													borderRadius: theme.radius,
													color: theme.fg,
													borderColor: theme.border,
													backgroundColor: theme.bg,
												},
											]}
										/>
									</View>
								)}

								{error && (
									<Text
										style={[
											styles.error,
											theme.font("400"),
											{
												color: theme.danger,
												backgroundColor: theme.dangerBg,
												borderRadius: offset(theme.radius, -1),
											},
										]}
										accessibilityLiveRegion="assertive"
									>
										{error}
									</Text>
								)}

								<Pressable
									testID="tattle-send"
									onPress={submit}
									disabled={sending}
									accessibilityRole="button"
									accessibilityState={{ busy: sending }}
									style={({ pressed }) => {
										const down = pressed || sending;
										// With an edge, the button sinks onto it; without, it fades.
										return theme.accentEdge
											? [
													styles.submitEdge,
													{
														borderRadius: theme.buttonRadius,
														backgroundColor: down
															? "transparent"
															: theme.accentEdge,
														paddingTop: down ? EDGE : 0,
														paddingBottom: down ? 0 : EDGE,
													},
												]
											: [styles.submitEdge, down && styles.pressed];
									}}
								>
									<View
										style={[
											styles.submit,
											{
												backgroundColor: theme.accent,
												borderRadius: theme.buttonRadius,
											},
										]}
									>
										{sending && (
											<ActivityIndicator size="small" color={theme.accentFg} />
										)}
										<Text
											style={[
												styles.submitText,
												theme.font("600"),
												{ color: theme.accentFg },
											]}
										>
											{sending ? t.sending : t.send}
										</Text>
									</View>
								</Pressable>
							</ScrollView>
						)}
					</Animated.View>
				</KeyboardAvoidingView>
			)}
		</Modal>
	);
}

function SmallButton({
	icon,
	label,
	theme,
	danger,
	onPress,
}: {
	icon: "edit" | "trash";
	label: string;
	theme: Theme;
	danger?: boolean;
	onPress: () => void;
}) {
	const color = danger ? theme.danger : theme.fg;
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			style={({ pressed }) => [
				styles.smallButton,
				{
					backgroundColor: theme.subtle,
					borderRadius: offset(theme.buttonRadius, -2),
				},
				pressed && styles.pressed,
			]}
		>
			<Icon name={icon} color={color} size={16} />
			<Text style={[styles.smallButtonText, theme.font("500"), { color }]}>
				{label}
			</Text>
		</Pressable>
	);
}

/** Height of the send button's edge (`theme.accentEdge`). */
const EDGE = 3;

const styles = StyleSheet.create({
	fill: { flex: 1, justifyContent: "flex-end" },
	editor: { flex: 1 },
	sheet: {
		flexShrink: 1,
		width: "100%",
		maxWidth: 560,
		alignSelf: "center",
	},
	grabber: {
		alignSelf: "center",
		width: 36,
		height: 4,
		borderRadius: 2,
		marginTop: 8,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingTop: 10,
		paddingBottom: 6,
		paddingLeft: 20,
		paddingRight: 12,
	},
	title: { letterSpacing: -0.2, flexShrink: 1 },
	headerStart: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		flexShrink: 1,
	},
	backButton: { marginLeft: -10 },
	iconButton: {
		width: 36,
		height: 36,
		alignItems: "center",
		justifyContent: "center",
	},
	scroll: { flexGrow: 0, flexShrink: 1 },
	body: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4, gap: 16 },
	segment: {
		flexDirection: "row",
		padding: 4,
		gap: 4,
	},
	segmentButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 7,
		minHeight: 40,
		borderWidth: 1,
		borderColor: "transparent",
	},
	segmentText: { fontSize: 14 },
	field: { gap: 7 },
	label: { fontSize: 14 },
	hint: { fontSize: 12.5 },
	capture: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 46,
		paddingHorizontal: 14,
		borderWidth: 1,
		borderStyle: "dashed",
	},
	captureText: { fontSize: 15 },
	shot: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 8,
		borderWidth: 1,
	},
	thumb: { width: 64, height: 96, borderWidth: 1 },
	shotActions: { flex: 1, gap: 8, alignItems: "flex-start" },
	smallButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 34,
		paddingHorizontal: 12,
	},
	smallButtonText: { fontSize: 14 },
	input: {
		borderWidth: 1,
		paddingHorizontal: 13,
		paddingVertical: 11,
		fontSize: 16,
	},
	textarea: { minHeight: 112, maxHeight: 200 },
	error: {
		fontSize: 14,
		paddingHorizontal: 12,
		paddingVertical: 10,
		overflow: "hidden",
	},
	submitEdge: { marginTop: 2 },
	submit: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		minHeight: 48,
	},
	submitText: { fontSize: 16 },
	pressed: { opacity: 0.75 },
	success: {
		alignItems: "center",
		gap: 14,
		paddingTop: 28,
		paddingBottom: 36,
	},
	successIcon: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
	},
	successTint: { borderRadius: 28, opacity: 0.14 },
	successText: { fontSize: 16 },
});
