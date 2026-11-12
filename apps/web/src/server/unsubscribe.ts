import { createHmac, timingSafeEqual } from "node:crypto";
import {
	NOTIFICATION_TYPES,
	type NotificationType,
} from "#/shared/notifications";
import { env } from "./env";

/**
 * What an unsubscribe link stops: one kind of email for one team member, or
 * every email about one report for the person who sent it.
 */
export type UnsubscribeTarget =
	| { kind: "team"; userId: string; type: NotificationType }
	| { kind: "report"; reportId: string };

// Links in emails must keep working, so they do not expire. The key is
// derived from the server secret for this purpose only.
const signature = (payload: string) =>
	createHmac(
		"sha256",
		createHmac("sha256", env.secret).update("tattle:unsubscribe").digest(),
	)
		.update(payload)
		.digest("base64url");

const PART = /^[A-Za-z0-9_-]+$/;

export const signUnsubscribe = (target: UnsubscribeTarget) => {
	const payload =
		target.kind === "team"
			? `u.${target.userId}.${target.type}`
			: `r.${target.reportId}`;
	return `${payload}.${signature(payload)}`;
};

/** The target of a token, or null when it was not signed by this server. */
export const readUnsubscribe = (token: string): UnsubscribeTarget | null => {
	const parts = token.split(".");
	const given = parts.pop();
	if (!given || parts.length < 2 || !parts.every((p) => PART.test(p)))
		return null;
	const expected = Buffer.from(signature(parts.join(".")));
	const actual = Buffer.from(given);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
		return null;
	const [kind, id, type] = parts as [string, string, string | undefined];
	if (
		kind === "u" &&
		parts.length === 3 &&
		NOTIFICATION_TYPES.includes(type as NotificationType)
	)
		return { kind: "team", userId: id, type: type as NotificationType };
	if (kind === "r" && parts.length === 2)
		return { kind: "report", reportId: id };
	return null;
};

/** The page behind "Unsubscribe" in an email: one button to confirm. */
export const unsubscribePageUrl = (token: string) =>
	`${env.baseUrl}/unsubscribe/${token}`;

/**
 * RFC 8058 one-click unsubscribe: mail apps POST to the List-Unsubscribe URL
 * when the person presses their own "Unsubscribe" button.
 */
export const unsubscribeHeaders = (token: string) => ({
	"List-Unsubscribe": `<${env.baseUrl}/api/v1/unsubscribe/${token}>`,
	"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

/** The footer and headers of an email to someone who reported. */
export const reporterUnsubscribe = (reportId: string) => {
	const token = signUnsubscribe({ kind: "report", reportId });
	return {
		footer: {
			text: "You get this email because you sent this report.",
			links: [
				{
					label: "Stop emails about this report",
					url: unsubscribePageUrl(token),
				},
			],
		},
		headers: unsubscribeHeaders(token),
	};
};
