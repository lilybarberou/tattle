import type { JsonObject } from "#/db/schema";
import { STATUS_LABELS, type WebhookEvent } from "#/shared/issues";
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

const plural = (count: number, one: string, many: string) =>
	`${count} ${count === 1 ? one : many}`;

const truncate = (text: string, max: number) =>
	text.length > max ? `${text.slice(0, max - 1)}…` : text;

export function describeEvent(
	event: WebhookEvent | "ping",
	projectId: string,
	raw: unknown,
): ChatMessage | null {
	const data = (raw ?? {}) as Data;
	const issueUrl = (issue: Issue) =>
		`${env.baseUrl}/p/${projectId}/issues/${issue.number}`;

	if (event === "ping") {
		return {
			title: "Tattle is connected",
			url: env.baseUrl,
			text: "New reports, status changes and comments will appear in this channel.",
			color: COLORS.update,
			fields: [],
		};
	}

	if (event === "report.created" && data.report && data.issue) {
		const who =
			data.report.reporter?.name || data.report.reporter?.email || "Someone";
		const isBug = data.issue.type === "bug";
		const signals = [
			data.report.consoleErrors
				? plural(data.report.consoleErrors, "console error", "console errors")
				: null,
			data.report.failedRequests
				? plural(
						data.report.failedRequests,
						"failed request",
						"failed requests",
					)
				: null,
			data.report.hasScreenshot ? "screenshot attached" : null,
		].filter(Boolean);
		return {
			title: `${isBug ? "Bug" : "Idea"} #${data.issue.number}: ${truncate(data.issue.title, 200)}`,
			url: issueUrl(data.issue),
			text: truncate(data.report.message, 1500),
			color: isBug ? COLORS.bug : COLORS.feature,
			fields: [
				["From", who],
				...(data.report.pageUrl
					? ([
							[
								/^https?:\/\//i.test(data.report.pageUrl) ? "Page" : "Screen",
								truncate(data.report.pageUrl, 200),
							],
						] as Array<[string, string]>)
					: []),
				...(signals.length
					? ([["Evidence", signals.join(" · ")]] as Array<[string, string]>)
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
			title: `#${data.issue.number} opened: ${truncate(data.issue.title, 200)}`,
			url: issueUrl(data.issue),
			text: `${data.actor?.name ?? "Someone"} opened a ${data.issue.type === "bug" ? "bug" : "feature request"}.`,
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
					? `Merged into #${data.duplicateOf.number} ${data.duplicateOf.title}`
					: `${STATUS_LABELS[String(status.from)] ?? status.from} → **${STATUS_LABELS[to] ?? to}**`,
			);
		}
		if (assignee)
			lines.push(assignee.to ? `Assigned to **${assignee.to}**` : "Unassigned");
		if (data.issue.prUrl && status?.to === "in_review")
			lines.push(`Pull request: ${data.issue.prUrl}`);
		return {
			title: `#${data.issue.number} ${truncate(data.issue.title, 200)}`,
			url: issueUrl(data.issue),
			text: `${lines.join("\n")}\n— ${data.actor?.name ?? "Someone"}`,
			color: status?.to === "done" ? COLORS.done : COLORS.update,
			fields: [],
		};
	}

	if (event === "comment.created" && data.issue && data.comment) {
		return {
			title: `Comment on #${data.issue.number} ${truncate(data.issue.title, 200)}`,
			url: issueUrl(data.issue),
			text: `${truncate(data.comment.body, 1500)}\n— ${data.comment.author.name}${data.comment.author.type === "agent" ? " (agent)" : ""}`,
			color: COLORS.comment,
			fields: [],
		};
	}
	return null;
}

export function toDiscord(message: ChatMessage): JsonObject {
	return {
		username: "Tattle",
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

export function toSlack(message: ChatMessage): JsonObject {
	const fields = message.fields
		.map(([name, value]) => `*${name}:* ${value}`)
		.join("\n");
	// Slack's mrkdwn uses single asterisks for bold.
	const text = message.text.replace(/\*\*(.+?)\*\*/g, "*$1*");
	return {
		text: `<${message.url}|${message.title}>\n${text}${fields ? `\n${fields}` : ""}`,
		unfurl_links: false,
	};
}
