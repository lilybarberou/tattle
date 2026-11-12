import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import type { Strings } from "../i18n";
import { MAX_MESSAGE_LENGTH } from "../payload";
import {
	fetchThread,
	markRead,
	ReporterApiError,
	type ReporterStatus,
	type ReportSummary,
	sendMessage,
	statusLabel,
	type Thread,
} from "../reporter";
import type { Locale } from "../types";
import { Icon } from "./icons";
import { offset, type Theme } from "./theme";

const formatDate = (iso: string, locale: Locale) => {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	try {
		return new Intl.DateTimeFormat(locale, {
			day: "numeric",
			month: "short",
			hour: "numeric",
			minute: "2-digit",
		}).format(date);
	} catch {
		return date.toLocaleString();
	}
};

function StatusPill({
	t,
	theme,
	status,
	type,
}: {
	t: Strings;
	theme: Theme;
	status: ReporterStatus;
	type: "bug" | "feature";
}) {
	const active = status === "in_progress" || status === "fixed";
	return (
		<View
			style={[
				styles.pill,
				{ backgroundColor: theme.subtle },
				active && { borderColor: theme.accent },
			]}
		>
			<Text
				style={[
					styles.pillText,
					theme.font("600"),
					{ color: active ? theme.accent : theme.fg },
				]}
			>
				{statusLabel(t, status, type)}
			</Text>
		</View>
	);
}

/** The entry at the top of the form, once this person has sent something. */
export function ReportsEntry({
	t,
	theme,
	unread,
	onPress,
}: {
	t: Strings;
	theme: Theme;
	unread: number;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={
				unread > 0
					? `${t.myReports}, ${t.unreadReplies}: ${unread}`
					: t.myReports
			}
			style={({ pressed }) => [
				styles.entry,
				{ borderColor: theme.border, borderRadius: theme.radius },
				pressed && { backgroundColor: theme.subtle },
			]}
		>
			<Icon name="chat" color={theme.accent} size={18} />
			<Text style={[styles.entryText, theme.font("500"), { color: theme.fg }]}>
				{t.myReports}
			</Text>
			{unread > 0 && <Badge theme={theme} count={unread} />}
		</Pressable>
	);
}

export function Badge({
	theme,
	count,
	inverted,
}: {
	theme: Theme;
	count: number;
	inverted?: boolean;
}) {
	return (
		<View
			style={[
				styles.badge,
				{ backgroundColor: inverted ? theme.accentFg : theme.accent },
			]}
		>
			<Text
				style={[
					styles.badgeText,
					theme.font("700"),
					{ color: inverted ? theme.accent : theme.accentFg },
				]}
			>
				{count > 9 ? "9+" : String(count)}
			</Text>
		</View>
	);
}

export function ReportList({
	t,
	theme,
	locale,
	reports,
	failed,
	onOpen,
}: {
	t: Strings;
	theme: Theme;
	locale: Locale;
	reports: ReportSummary[];
	failed: boolean;
	onOpen: (id: string) => void;
}) {
	if (reports.length === 0)
		return (
			<Text
				style={[
					styles.empty,
					theme.font("400"),
					{ color: failed ? theme.danger : theme.muted },
				]}
			>
				{failed ? t.loadFailed : t.noReports}
			</Text>
		);
	return (
		<View style={styles.list}>
			{reports.map((report) => (
				<Pressable
					key={report.id}
					onPress={() => onOpen(report.id)}
					accessibilityRole="button"
					accessibilityHint={report.unread > 0 ? t.unreadReplies : undefined}
					style={({ pressed }) => [
						styles.item,
						{ borderColor: theme.border, borderRadius: theme.radius },
						pressed && { backgroundColor: theme.subtle },
					]}
				>
					<View style={styles.itemText}>
						<Text
							numberOfLines={1}
							style={[styles.itemTitle, theme.font("600"), { color: theme.fg }]}
						>
							{report.title}
						</Text>
						<Text
							style={[
								styles.itemMeta,
								theme.font("400"),
								{ color: theme.muted },
							]}
						>
							{report.type === "bug" ? t.typeBug : t.typeFeature} ·{" "}
							{formatDate(report.updatedAt, locale)}
						</Text>
					</View>
					<View style={styles.itemSide}>
						<StatusPill
							t={t}
							theme={theme}
							status={report.status}
							type={report.type}
						/>
						{report.unread > 0 && (
							<View style={[styles.dot, { backgroundColor: theme.accent }]} />
						)}
					</View>
				</Pressable>
			))}
		</View>
	);
}

/** One conversation: the report, the messages, a reply box. */
export function ThreadScreen({
	t,
	theme,
	locale,
	apiUrl,
	headers,
	reportId,
	unread,
	onRead,
}: {
	t: Strings;
	theme: Theme;
	locale: Locale;
	apiUrl: string;
	headers: () => Promise<Record<string, string> | null>;
	reportId: string;
	unread: boolean;
	onRead: () => void;
}) {
	const [thread, setThread] = useState<Thread | null>(null);
	const [failed, setFailed] = useState(false);
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: loads once per conversation
	useEffect(() => {
		let active = true;
		setThread(null);
		setFailed(false);
		void (async () => {
			const h = await headers();
			if (!h) return setFailed(true);
			try {
				const loaded = await fetchThread(apiUrl, h, reportId);
				if (!active) return;
				setThread(loaded);
				if (unread) {
					await markRead(apiUrl, h, reportId);
					if (active) onRead();
				}
			} catch {
				if (active) setFailed(true);
			}
		})();
		return () => {
			active = false;
		};
	}, [reportId]);

	const send = async () => {
		const text = body.trim();
		if (!thread || sending) return;
		if (!text) return setError(t.emptyMessage);
		setSending(true);
		setError(null);
		try {
			const h = await headers();
			if (!h) throw new ReporterApiError("", 404);
			const message = await sendMessage(apiUrl, h, thread.id, text);
			setThread({ ...thread, messages: [...thread.messages, message] });
			setBody("");
		} catch (err) {
			setError(
				err instanceof ReporterApiError && err.status === 0
					? t.networkError
					: (err instanceof Error && err.message) || t.genericError,
			);
		} finally {
			setSending(false);
		}
	};

	if (failed)
		return (
			<Text style={[styles.empty, theme.font("400"), { color: theme.danger }]}>
				{t.loadFailed}
			</Text>
		);
	if (!thread)
		return <ActivityIndicator style={styles.loading} color={theme.accent} />;

	const bubbles = [
		{
			id: "report",
			mine: true,
			name: t.you,
			body: thread.message,
			at: thread.createdAt,
		},
		...thread.messages.map((m) => ({
			id: m.id,
			mine: m.from === "reporter",
			name: m.from === "reporter" ? t.you : m.name || t.team,
			body: m.body,
			at: m.createdAt,
		})),
	];

	return (
		<View style={styles.thread}>
			<View style={styles.threadHead}>
				<Text
					style={[styles.threadTitle, theme.font("600"), { color: theme.fg }]}
				>
					{thread.title}
				</Text>
				<StatusPill
					t={t}
					theme={theme}
					status={thread.status}
					type={thread.type}
				/>
			</View>
			{bubbles.map((b) => (
				<View
					key={b.id}
					style={[
						styles.bubble,
						{
							borderRadius: theme.radius,
							backgroundColor: theme.subtle,
							alignSelf: b.mine ? "flex-end" : "flex-start",
						},
						b.mine && { borderWidth: 1, borderColor: theme.accent },
					]}
				>
					<Text
						style={[
							styles.bubbleMeta,
							theme.font("400"),
							{ color: theme.muted },
						]}
					>
						{b.name} · {formatDate(b.at, locale)}
					</Text>
					<Text
						style={[styles.bubbleText, theme.font("400"), { color: theme.fg }]}
					>
						{b.body}
					</Text>
				</View>
			))}
			<TextInput
				testID="tattle-reply"
				value={body}
				onChangeText={(value) => {
					setBody(value);
					if (error) setError(null);
				}}
				placeholder={t.replyPlaceholder}
				placeholderTextColor={theme.muted}
				accessibilityLabel={t.replyLabel}
				multiline
				maxLength={MAX_MESSAGE_LENGTH}
				textAlignVertical="top"
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
				testID="tattle-reply-send"
				onPress={send}
				disabled={sending}
				accessibilityRole="button"
				accessibilityState={{ busy: sending }}
				style={({ pressed }) => [
					styles.send,
					{ backgroundColor: theme.accent, borderRadius: theme.buttonRadius },
					(pressed || sending) && styles.pressed,
				]}
			>
				{sending && <ActivityIndicator size="small" color={theme.accentFg} />}
				<Text
					style={[
						styles.sendText,
						theme.font("600"),
						{ color: theme.accentFg },
					]}
				>
					{sending ? t.sending : t.send}
				</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	entry: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 44,
		paddingHorizontal: 14,
		borderWidth: 1,
	},
	entryText: { flex: 1, fontSize: 15 },
	badge: {
		minWidth: 20,
		height: 20,
		paddingHorizontal: 6,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	badgeText: { fontSize: 12 },
	list: { gap: 8 },
	item: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 14,
		paddingVertical: 11,
		borderWidth: 1,
	},
	itemText: { flex: 1, gap: 3 },
	itemTitle: { fontSize: 15 },
	itemMeta: { fontSize: 12.5 },
	itemSide: { alignItems: "flex-end", gap: 6 },
	dot: { width: 9, height: 9, borderRadius: 5 },
	pill: {
		paddingHorizontal: 9,
		paddingVertical: 3,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: "transparent",
	},
	pillText: { fontSize: 12 },
	empty: { fontSize: 14, textAlign: "center", paddingVertical: 20 },
	loading: { paddingVertical: 24 },
	thread: { gap: 10 },
	threadHead: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 10,
	},
	threadTitle: { flex: 1, fontSize: 16 },
	bubble: { maxWidth: "88%", paddingHorizontal: 12, paddingVertical: 8 },
	bubbleMeta: { fontSize: 12, marginBottom: 2 },
	bubbleText: { fontSize: 15 },
	input: {
		borderWidth: 1,
		paddingHorizontal: 13,
		paddingVertical: 11,
		fontSize: 16,
		minHeight: 80,
		maxHeight: 160,
		marginTop: 4,
	},
	error: {
		fontSize: 14,
		paddingHorizontal: 12,
		paddingVertical: 10,
		overflow: "hidden",
	},
	send: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		minHeight: 46,
	},
	sendText: { fontSize: 16 },
	pressed: { opacity: 0.75 },
});
