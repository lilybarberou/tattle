// The emails Tattle sends to team members, shared by the server and the
// Notifications page. Keep this file free of server-only imports.

export const NOTIFICATION_TYPES = [
	"reporter_replied",
	"assigned",
	"regression",
	"triage_digest",
	"ai_key_failing",
	"webhook_failing",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** The UTC hour the daily triage digest goes out, unless TRIAGE_DIGEST_HOUR says otherwise. */
export const DEFAULT_DIGEST_HOUR = 8;

/** Reporter messages on one report within this window come as one email. */
export const REPORTER_REPLY_WINDOW_MINUTES = 10;

export const NOTIFICATION_META: Record<
	NotificationType,
	{ label: string; description: string; adminOnly: boolean }
> = {
	reporter_replied: {
		label: "A reporter answered",
		description: `When someone who sent a report writes back. It goes to the issue's assignee; when nobody is assigned, to the team members who replied in that conversation, or else to owners and admins. Messages within ${REPORTER_REPLY_WINDOW_MINUTES} minutes come as one email.`,
		adminOnly: false,
	},
	assigned: {
		label: "Assigned to you",
		description:
			"When someone else or an agent assigns an issue to you. Never when you assign yourself.",
		adminOnly: false,
	},
	regression: {
		label: "A fixed bug came back",
		description:
			"When a bug marked done gets a newer report and is reopened. It goes to the assignee, or to owners and admins when nobody is assigned.",
		adminOnly: false,
	},
	triage_digest: {
		label: "Daily triage digest",
		description:
			"Once a day, the new issues waiting in Triage in each project, only on days with something new. On by default for owners and admins.",
		adminOnly: false,
	},
	ai_key_failing: {
		label: "The AI key stopped working",
		description:
			"When the AI provider keeps refusing the workspace's key (revoked, out of credit, over quota). At most once a day.",
		adminOnly: true,
	},
	webhook_failing: {
		label: "A webhook keeps failing",
		description:
			"When a webhook, Discord or Slack channel still fails after its retries. Once, until a delivery to it works again.",
		adminOnly: true,
	},
};

export type NotificationSettingsView = {
	/** Owner or admin of at least one workspace: sees the admin-only emails. */
	isAdmin: boolean;
	/** False when the server has no SMTP: nothing is emailed at all. */
	mailEnabled: boolean;
	digestHourUtc: number;
	email: string;
	settings: Record<NotificationType, boolean>;
};
