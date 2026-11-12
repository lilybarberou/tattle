// Constants and types shared by the server and the browser. Keep this file free
// of server-only imports: route components import it.

export const ISSUE_STATUSES = [
	"triage",
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"done",
	"canceled",
	"duplicate",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssueType = "bug" | "feature";

export const PRIORITY_LABELS = [
	"none",
	"urgent",
	"high",
	"medium",
	"low",
] as const;

export const WEBHOOK_EVENTS = [
	"report.created",
	"issue.created",
	"issue.updated",
	"comment.created",
	"message.created",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * An issue's status as the person who reported it sees it, in the widget and
 * on the reply page: never the team's internal stages.
 */
export const REPORTER_STATUSES = [
	"received",
	"planned",
	"in_progress",
	"fixed",
	"wont_fix",
] as const;
export type ReporterStatus = (typeof REPORTER_STATUSES)[number];

export const reporterStatus = (status: IssueStatus): ReporterStatus => {
	switch (status) {
		case "todo":
			return "planned";
		case "in_progress":
		case "in_review":
			return "in_progress";
		case "done":
			return "fixed";
		case "canceled":
			return "wont_fix";
		default:
			// Triage and backlog: seen, not promised. A duplicate whose original
			// is unknown stays "received" too.
			return "received";
	}
};

export const REPORTER_STATUS_LABELS: Record<ReporterStatus, string> = {
	received: "Received",
	planned: "Planned",
	in_progress: "In progress",
	fixed: "Fixed",
	wont_fix: "Won't fix",
};

/** Longest message a reporter or the team can send in a conversation. */
export const MAX_MESSAGE_LENGTH = 5000;

/** Status names as people read them (dashboard, emails, chat messages). */
export const STATUS_LABELS: Record<string, string> = {
	triage: "Triage",
	backlog: "Backlog",
	todo: "Todo",
	in_progress: "In progress",
	in_review: "In review",
	done: "Done",
	canceled: "Declined",
	duplicate: "Duplicate",
};

export const WEBHOOK_FORMATS = ["json", "discord", "slack"] as const;
export type WebhookFormat = (typeof WEBHOOK_FORMATS)[number];
