import type { Strings } from "../i18n";
import type { ReporterStatus, ReportSummary, Thread } from "../reporter";
import type { Locale } from "../types";
import { h } from "./dom";

/** The status in the reporter's words; a done idea is "available", a done bug "fixed". */
export function statusLabel(
	t: Strings,
	status: ReporterStatus,
	type: "bug" | "feature",
): string {
	switch (status) {
		case "planned":
			return t.statusPlanned;
		case "in_progress":
			return t.statusInProgress;
		case "fixed":
			return type === "feature" ? t.statusShipped : t.statusFixed;
		case "wont_fix":
			return t.statusWontFix;
		default:
			return t.statusReceived;
	}
}

export function formatDate(iso: string, locale: Locale): string {
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
}

const statusPill = (
	t: Strings,
	status: ReporterStatus,
	type: "bug" | "feature",
) =>
	h(
		"span",
		{ class: "fb-status", "data-status": status },
		statusLabel(t, status, type),
	);

/** The reporter's reports, newest activity first. Text only, never HTML. */
export function renderList(
	t: Strings,
	locale: Locale,
	reports: ReportSummary[],
	onOpen: (id: string) => void,
): HTMLElement {
	if (reports.length === 0)
		return h("p", { class: "fb-hint fb-empty" }, t.noReports);
	const list = h("ul", { class: "fb-list" });
	for (const report of reports) {
		const button = h(
			"button",
			{ type: "button", class: "fb-item" },
			h("span", { class: "fb-item-title" }, report.title),
			statusPill(t, report.status, report.type),
			h(
				"span",
				{ class: "fb-item-meta" },
				`${report.type === "bug" ? t.typeBug : t.typeFeature} · ${formatDate(report.updatedAt, locale)}`,
			),
			report.unread > 0
				? h("span", {
						class: "fb-unread-dot",
						role: "img",
						"aria-label": t.unreadReplies,
					})
				: null,
		);
		button.addEventListener("click", () => onOpen(report.id));
		list.append(h("li", {}, button));
	}
	return list;
}

/** The report itself, then the conversation. */
export function renderThread(
	t: Strings,
	locale: Locale,
	thread: Thread,
): HTMLElement {
	const bubble = (
		mine: boolean,
		name: string,
		body: string,
		createdAt: string,
	) =>
		h(
			"li",
			{ class: mine ? "fb-msg fb-msg-mine" : "fb-msg" },
			h(
				"span",
				{ class: "fb-msg-meta" },
				`${name} · ${formatDate(createdAt, locale)}`,
			),
			body,
		);
	return h(
		"div",
		{ class: "fb-field" },
		h(
			"div",
			{ class: "fb-thread-head" },
			h("p", { class: "fb-thread-title" }, thread.title),
			statusPill(t, thread.status, thread.type),
		),
		h(
			"ol",
			{ class: "fb-msgs" },
			bubble(true, t.you, thread.message, thread.createdAt),
			...thread.messages.map((m) =>
				bubble(
					m.from === "reporter",
					m.from === "reporter" ? t.you : m.name || t.team,
					m.body,
					m.createdAt,
				),
			),
		),
	);
}
