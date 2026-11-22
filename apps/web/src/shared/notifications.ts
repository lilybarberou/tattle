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

/** Which emails only owners and admins see. Names and descriptions: the catalogues' `common.notificationType`. */
export const NOTIFICATION_META: Record<
	NotificationType,
	{ adminOnly: boolean }
> = {
	reporter_replied: { adminOnly: false },
	assigned: { adminOnly: false },
	regression: { adminOnly: false },
	triage_digest: { adminOnly: false },
	ai_key_failing: { adminOnly: true },
	webhook_failing: { adminOnly: true },
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
