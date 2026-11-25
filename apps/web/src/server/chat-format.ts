import type { JsonObject } from "#/db/schema";
import { DEFAULT_LOCALE, type Locale, messages } from "#/i18n";
import type { IssueStatus, WebhookEvent } from "#/shared/issues";
import { env } from "./env";

/**
 * Turns a webhook event into a chat message for Discord or Slack. Returns null
 * for changes not worth a message (labels, a renamed issue…), so the channel
 * only hears about new reports, status and assignee changes, and comments.
 */
type Issue = {
	number: number;
	title: string;
	type: "bug" | "feature";
	status: string;
	reportCount?: number;
	assignee?: { name?: string | null } | null;
	prUrl?: string | null;
};
type Data = {
	issue?: Issue;
	report?: {
		message: string;
		pageUrl: string;
		reporter?: { name?: string; email?: string } | null;
		hasScreenshot?: boolean;
		consoleErrors?: number;
		failedRequests?: number;
	};
	changes?: Record<string, { from: unknown; to: unknown }>;
	comment?: { body: string; author: { name: string; type: string } };
	message?: {
		from: "team" | "reporter";
		body: string;
		author: { name: string; type: string };
	};
	actor?: { name: string; type: string };
	duplicateOf?: Issue | null;
};

export type ChatMessage = {
	title: string;
	url: string;
	text: string;
	color: number;
	fields: Array<[string, string]>;
};

const COLORS = {
	bug: 0xc4242a,
	feature: 0xa86f0c,
	update: 0x1b6c80,
	done: 0x1e7b4f,
	comment: 0x5d5f60,
};

const truncate = (text: string, max: number) =>
	text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** `locale` is the project's chat language (project settings). */
export function describeEvent(
	event: WebhookEvent | "ping",
	projectId: string,
	raw: unknown,
	locale: Locale = DEFAULT_LOCALE,
): ChatMessage | null {
	const data = (raw ?? {}) as Data;
	const m = messages(locale);
	const t = m.chat;
	const statusName = (status: unknown) =>
		m.common.status[String(status) as IssueStatus] ?? String(status);
	const author = (who: { name: string; type: string }) =>
		who.type === "agent" ? `${who.name} (${t.agent})` : who.name;
	const issueUrl = (issue: Issue) =>
		`${env.baseUrl}/p/${projectId}/issues/${issue.number}`;

	if (event === "ping") {
		return {
			title: t.ping.title,
			url: env.baseUrl,
			text: t.ping.text,
			color: COLORS.update,
			fields: [],
		};
	}

	if (event === "report.created" && data.report && data.issue) {
		const who =
			data.report.reporter?.name || data.report.reporter?.email || t.someone;
		const isBug = data.issue.type === "bug";
		const signals = [
			data.report.consoleErrors
				? t.consoleErrors(data.report.consoleErrors)
				: null,
			data.report.failedRequests
				? t.failedRequests(data.report.failedRequests)
				: null,
			data.report.hasScreenshot ? t.screenshot : null,
		].filter(Boolean);
		return {
			title: t.reportTitle({
				type: isBug ? "bug" : "feature",
				number: data.issue.number,
				title: truncate(data.issue.title, 200),
			}),
			url: issueUrl(data.issue),
			text: truncate(data.report.message, 1500),
			color: isBug ? COLORS.bug : COLORS.feature,
			fields: [
				[t.from, who],
				...(data.report.pageUrl
					? ([
							[
								/^https?:\/\//i.test(data.report.pageUrl) ? t.page : t.screen,
								truncate(data.report.pageUrl, 200),
							],
						] as Array<[string, string]>)
					: []),
				...(signals.length
					? ([[t.evidence, signals.join(" · ")]] as Array<[string, string]>)
					: []),
			],
		};
	}

	if (
		event === "issue.created" &&
		data.issue &&
		data.actor?.type !== "system"
	) {
		return {
			title: t.opened({
				number: data.issue.number,
				title: truncate(data.issue.title, 200),
			}),
			url: issueUrl(data.issue),
			text: t.openedBy({
				actor: data.actor?.name ?? t.someone,
				type: data.issue.type,
			}),
			color: COLORS.update,
			fields: [],
		};
	}

	if (event === "issue.updated" && data.issue) {
		const status = data.changes?.status;
		const assignee = data.changes?.assigneeName;
		if (!status && !assignee) return null;
		const lines: string[] = [];
		if (status) {
			const to = String(status.to);
			lines.push(
				to === "duplicate" && data.duplicateOf
					? t.mergedInto(data.duplicateOf)
					: `${statusName(status.from)} → **${statusName(to)}**`,
			);
		}
		if (assignee)
			lines.push(
				assignee.to ? t.assignedTo(String(assignee.to)) : t.unassigned,
			);
		if (data.issue.prUrl && status?.to === "in_review")
			lines.push(t.pullRequest(data.issue.prUrl));
		return {
			title: `#${data.issue.number} ${truncate(data.issue.title, 200)}`,
			url: issueUrl(data.issue),
			text: `${lines.join("\n")}\n— ${data.actor?.name ?? t.someone}`,
			color: status?.to === "done" ? COLORS.done : COLORS.update,
			fields: [],
		};
	}

	if (event === "comment.created" && data.issue && data.comment) {
		return {
			title: t.commentOn({
				number: data.issue.number,
				title: truncate(data.issue.title, 200),
			}),
			url: issueUrl(data.issue),
			text: `${truncate(data.comment.body, 1500)}\n— ${author(data.comment.author)}`,
			color: COLORS.comment,
			fields: [],
		};
	}

	if (event === "message.created" && data.issue && data.message) {
		const fromReporter = data.message.from === "reporter";
		return {
			title: (fromReporter ? t.reporterReplied : t.replyToReporter)({
				number: data.issue.number,
				title: truncate(data.issue.title, 200),
			}),
			url: issueUrl(data.issue),
			text: `${truncate(data.message.body, 1500)}\n— ${author(data.message.author)}`,
			color: fromReporter ? COLORS.feature : COLORS.comment,
			fields: [],
		};
	}
	return null;
}

export function toDiscord(message: ChatMessage): JsonObject {
	return {
		username: "Tattle",
		// Reporters write part of the text: "@everyone" or a role must not ping.
		allowed_mentions: { parse: [] },
		embeds: [
			{
				title: truncate(message.title, 256),
				url: message.url,
				description: truncate(message.text, 4000),
				color: message.color,
				fields: message.fields.map(([name, value]) => ({
					name,
					value: truncate(value, 1024),
					inline: false,
				})),
			},
		],
	};
}

/**
 * Slack's control characters: reporters write part of the text, and
 * "<!channel>" or "<https://evil.example|your invoice>" must stay plain text.
 */
const slackEscape = (text: string) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function toSlack(message: ChatMessage): JsonObject {
	const fields = message.fields
		.map(([name, value]) => `*${slackEscape(name)}:* ${slackEscape(value)}`)
		.join("\n");
	// Slack's mrkdwn uses single asterisks for bold.
	const text = slackEscape(message.text).replace(/\*\*(.+?)\*\*/g, "*$1*");
	// A "|" in the title would end the link's label early.
	const title = slackEscape(message.title).replace(/\|/g, "¦");
	return {
		text: `<${message.url}|${title}>\n${text}${fields ? `\n${fields}` : ""}`,
		unfurl_links: false,
	};
}
