import type { JsonObject } from "#/db/schema";
import { DEFAULT_LOCALE, type Locale, messages } from "#/i18n";
import { deviceSummary, isWebPage } from "#/shared/device";
import {
	type IssueStatus,
	PRIORITY_LABELS,
	type WebhookEvent,
} from "#/shared/issues";
import { env } from "./env";

/**
 * Turns a webhook event into a chat message for Discord or Slack. Returns null
 * for changes not worth a message (labels, a renamed issue…), so the channel
 * only hears about new reports, status and assignee changes, and comments.
 *
 * Each message stands on its own: someone reading it on a phone knows which
 * project, which issue, who and on which device without opening Tattle. The
 * channel is the team's own, so names and emails are in; secrets never are
 * (the identity hash, the reporter key, tokens, cookies), nor full logs.
 */
type Actor = { name: string; type: string };
type Issue = {
	number: number;
	title: string;
	type: "bug" | "feature";
	status: string;
	description?: string;
	priority?: number;
	labels?: string[];
	reportCount?: number;
	assignee?: { name?: string | null } | null;
	prUrl?: string | null;
};
type Reporter = {
	id?: string;
	name?: string;
	email?: string;
	traits?: Record<string, unknown> | null;
};
type Data = {
	issue?: Issue;
	report?: {
		id?: string;
		message: string;
		pageUrl: string;
		pageTitle?: string | null;
		release?: string | null;
		reporter?: Reporter | null;
		device?: Record<string, unknown> | null;
		hasScreenshot?: boolean;
		consoleErrors?: number;
		failedRequests?: number;
	};
	changes?: Record<string, { from: unknown; to: unknown }>;
	comment?: { body: string; author: Actor };
	message?: { from: "team" | "reporter"; body: string; author: Actor };
	actor?: Actor;
	duplicateOf?: Issue | null;
	/** An open duplicate suggestion for the issue, when there is one. */
	duplicateSuggestion?: { number: number; title: string } | null;
	regression?: { release?: string | null };
};

export type ChatMessage = {
	title: string;
	url: string;
	text: string;
	color: number;
	fields: Array<[string, string]>;
};

/** The project a message is about: its name starts every title. */
export type ChatProject = { id: string; name: string };

/**
 * Notification hubs (Clairon, for one) give each message a level: from a
 * level emoji in the title (⚠️ warning, ✅ success, 🔥 ❌ 🚨 error), else from
 * the embed colour's hue: red error, orange to yellow warning, green success,
 * any other hue or a grey info. So only a regression looks like a warning
 * and only a shipped issue like a success. The bug red stays: behind a title
 * that starts with another emoji (🐞), a red is read as a brand colour, info.
 */
const COLORS = {
	bug: 0xc4242a,
	/** Feature requests and reporter messages: a blue, info. */
	feature: 0x2f6fd0,
	update: 0x1b6c80,
	done: 0x1e7b4f,
	regression: 0xa86f0c,
	comment: 0x5d5f60,
};

const ICONS = {
	bug: "🐞",
	feature: "💡",
	created: "🆕",
	updated: "🔄",
	done: "✅",
	regression: "⚠️",
	merged: "🔀",
	assigned: "👤",
	comment: "💬",
	fromReporter: "📨",
	toReporter: "↩️",
	ping: "✅",
};

/** Field values stay short: they are read on a phone. */
const SHORT = 80;
const LONG_TEXT = 1500;
const EXCERPT = 600;
const MAX_TRAITS = 3;
/**
 * Identify traits are the host app's own: one may hold a credential, whatever
 * the integrator meant. Such a key is never shown, nor are nested values.
 */
const SECRET_KEY =
	/pass|secret|token|key$|api.?key|hash|signature|cookie|session|auth(?!or)|credential|card|iban|ssn/i;

const truncate = (text: string, max: number) =>
	text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** The first lines of a text, for a comment or a message read on a phone. */
const excerpt = (text: string, max = EXCERPT, lines = 8) => {
	const kept = text.trim().split("\n");
	const head = kept.slice(0, lines).join("\n");
	return truncate(kept.length > lines ? `${head.trimEnd()}\n…` : head, max);
};

const field = (
	name: string,
	value: string | null | undefined,
	max = SHORT,
): Array<[string, string]> =>
	value?.trim() ? [[name, truncate(value.trim(), max)]] : [];

const safeTraits = (traits: Reporter["traits"]) =>
	Object.entries(traits ?? {})
		.filter(
			([key, value]) =>
				key.trim() !== "" &&
				!SECRET_KEY.test(key) &&
				(typeof value === "string" ||
					typeof value === "number" ||
					typeof value === "boolean"),
		)
		.slice(0, MAX_TRAITS)
		.map(([key, value]) => [truncate(key, 40), String(value)] as const);

/** `locale` is the project's chat language (project settings). */
export function describeEvent(
	event: WebhookEvent | "ping",
	project: ChatProject,
	raw: unknown,
	locale: Locale = DEFAULT_LOCALE,
): ChatMessage | null {
	const data = (raw ?? {}) as Data;
	const m = messages(locale);
	const t = m.chat;
	const f = t.fields;
	const projectName = truncate(project.name.trim() || "Tattle", 40);
	const statusName = (status: unknown) =>
		m.common.status[String(status) as IssueStatus] ?? String(status);
	const who = (actor?: Actor | null) =>
		!actor
			? t.someone
			: actor.type === "agent"
				? `${actor.name} (${t.agent})`
				: actor.name;
	const issueUrl = (issue: Issue) =>
		`${env.baseUrl}/p/${project.id}/issues/${issue.number}`;
	// The dashboard opens and scrolls to the report with this anchor.
	const reportUrl = (issue: Issue, reportId?: string) =>
		reportId ? `${issueUrl(issue)}#report-${reportId}` : issueUrl(issue);
	const title = (icon: string, issue: Issue) =>
		`${icon} ${projectName} #${issue.number} · ${truncate(issue.title, 200)}`;

	if (event === "ping") {
		return {
			title: `${ICONS.ping} ${projectName} · ${t.ping.title}`,
			url: `${env.baseUrl}/p/${project.id}/settings`,
			text: t.ping.text,
			color: COLORS.update,
			fields: [],
		};
	}

	if (event === "report.created" && data.report && data.issue) {
		const report = data.report;
		const reporter = report.reporter ?? {};
		const isBug = data.issue.type === "bug";
		const device = deviceSummary(report.device ?? {});
		const web = isWebPage(report.pageUrl);
		const signals = [
			report.consoleErrors ? t.consoleErrors(report.consoleErrors) : null,
			report.failedRequests ? t.failedRequests(report.failedRequests) : null,
			report.hasScreenshot ? t.screenshot : null,
		].filter(Boolean);
		const machine = device.mobile
			? [device.model, device.os]
			: [device.browser, device.os];
		const language =
			typeof report.device?.language === "string"
				? report.device.language
				: null;
		const suggestion = data.duplicateSuggestion;
		return {
			title: title(isBug ? ICONS.bug : ICONS.feature, data.issue),
			url: reportUrl(data.issue, report.id),
			text: truncate(report.message, LONG_TEXT),
			color: isBug ? COLORS.bug : COLORS.feature,
			fields: [
				[
					f.reporter,
					truncate(reporter.name || reporter.email || t.someone, SHORT),
				],
				...(reporter.name ? field(f.email, reporter.email) : []),
				...field(f.userId, reporter.id),
				...safeTraits(reporter.traits).flatMap(([key, value]) =>
					field(key, value),
				),
				...field(web ? f.page : f.screen, report.pageUrl, 200),
				...field(f.device, machine.filter(Boolean).join(" · ")),
				...(device.mobile ? field(f.app, device.app) : []),
				// A mobile app already shows its version in the App field.
				...(report.release && !device.app?.includes(report.release)
					? field(f.release, report.release)
					: []),
				...field(f.language, language),
				...field(f.evidence, signals.join(" · "), 200),
				...(suggestion
					? field(f.duplicate, `#${suggestion.number} ${suggestion.title}`)
					: []),
			],
		};
	}

	if (
		event === "issue.created" &&
		data.issue &&
		data.actor?.type !== "system"
	) {
		const issue = data.issue;
		const priority = PRIORITY_LABELS[issue.priority ?? 0];
		return {
			title: title(ICONS.created, issue),
			url: issueUrl(issue),
			text: issue.description ? excerpt(issue.description) : "",
			color: COLORS.update,
			fields: [
				[f.type, m.common.type[issue.type] ?? issue.type],
				[f.createdBy, truncate(who(data.actor), SHORT)],
				...(priority && priority !== "none"
					? field(f.priority, m.common.priority[priority])
					: []),
				...field(f.labels, (issue.labels ?? []).join(", ")),
			],
		};
	}

	if (event === "issue.updated" && data.issue) {
		const issue = data.issue;
		const status = data.changes?.status;
		const assignee = data.changes?.assigneeName;
		if (!status && !assignee) return null;
		const to = status ? String(status.to) : null;
		const merged = to === "duplicate" && data.duplicateOf;
		const regression = data.regression;
		const icon = merged
			? ICONS.merged
			: regression
				? ICONS.regression
				: to === "done"
					? ICONS.done
					: status
						? ICONS.updated
						: ICONS.assigned;
		return {
			title: title(icon, issue),
			url: issueUrl(issue),
			text: "",
			color: regression
				? COLORS.regression
				: to === "done"
					? COLORS.done
					: COLORS.update,
			fields: [
				...(status
					? field(f.status, `${statusName(status.from)} → ${statusName(to)}`)
					: []),
				...(merged
					? field(f.mergedInto, `#${merged.number} ${merged.title}`)
					: []),
				...(regression
					? field(f.regression, regression.release || t.reportedAfterDone)
					: []),
				...(assignee
					? field(f.assignee, assignee.to ? String(assignee.to) : t.unassigned)
					: []),
				...(issue.prUrl && to === "in_review"
					? field(f.pullRequest, issue.prUrl, 200)
					: []),
				[f.by, truncate(who(data.actor), SHORT)],
			],
		};
	}

	if (event === "comment.created" && data.issue && data.comment) {
		return {
			title: title(ICONS.comment, data.issue),
			url: issueUrl(data.issue),
			text: excerpt(data.comment.body),
			color: COLORS.comment,
			fields: [[f.author, truncate(who(data.comment.author), SHORT)]],
		};
	}

	if (event === "message.created" && data.issue && data.message) {
		const fromReporter = data.message.from === "reporter";
		const reporter = data.report?.reporter ?? {};
		const reporterName =
			reporter.name || reporter.email || data.message.author.name;
		return {
			title: title(
				fromReporter ? ICONS.fromReporter : ICONS.toReporter,
				data.issue,
			),
			url: reportUrl(data.issue, data.report?.id),
			text: excerpt(data.message.body),
			color: fromReporter ? COLORS.feature : COLORS.comment,
			fields: fromReporter
				? [
						[f.from, truncate(reporterName || t.someone, SHORT)],
						...(reporter.name ? field(f.email, reporter.email) : []),
					]
				: [
						[f.author, truncate(who(data.message.author), SHORT)],
						...field(f.to, reporter.name || reporter.email),
					],
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
				...(message.text ? { description: truncate(message.text, 4000) } : {}),
				color: message.color,
				fields: message.fields.slice(0, 25).map(([name, value]) => ({
					name: truncate(name, 256),
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

/**
 * No attachment, so no colour: Slack shows a plain message, and a hub that
 * reads levels takes it from the title's emoji (⚠️ regression, ✅ done), else
 * info, as for Discord.
 */
export function toSlack(message: ChatMessage): JsonObject {
	const fields = message.fields
		.map(([name, value]) => `*${slackEscape(name)}:* ${slackEscape(value)}`)
		.join("\n");
	// Slack's mrkdwn uses single asterisks for bold.
	const text = slackEscape(message.text).replace(/\*\*(.+?)\*\*/g, "*$1*");
	// A "|" in the title would end the link's label early.
	const title = slackEscape(message.title).replace(/\|/g, "¦");
	return {
		text: [`<${message.url}|${title}>`, text, fields]
			.filter(Boolean)
			.join("\n"),
		unfurl_links: false,
	};
}
