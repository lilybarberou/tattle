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
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

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
