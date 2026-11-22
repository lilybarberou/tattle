import { pluralizer } from "../../format";

const p = pluralizer("en");

const WHAT = {
	discord: "Discord channel",
	slack: "Slack channel",
	json: "webhook",
};

/** Emails Tattle sends, to the team and to people who reported or voted. */
export const emails = {
	/** Under the button, for mail apps that hide it. */
	openLink: "Or open this link:",
	/** "Hi Ada," or "Hi," when the name is unknown. */
	greeting: (name?: string | null) => (name ? `Hi ${name},` : "Hi,"),
	team: {
		footer: (label: string) =>
			`You get this email because “${label}” is on in your Tattle notification settings.`,
		settings: "Notification settings",
		unsubscribe: "Unsubscribe from these emails",
		openIssue: "Open the issue",
	},
	assigned: {
		subject: (p: { number: number; title: string }) =>
			`Assigned to you: #${p.number} ${p.title}`,
		text: (p: {
			actor: string;
			number: number;
			title: string;
			project: string;
		}) => `${p.actor} assigned you #${p.number} “${p.title}” in ${p.project}.`,
	},
	regression: {
		subject: (p: { number: number; title: string }) =>
			`Regression: #${p.number} ${p.title}`,
		text: (p: {
			number: number;
			title: string;
			project: string;
			release: string | null;
		}) =>
			`#${p.number} “${p.title}” in ${p.project} was done, and a newer report came in${p.release ? ` from release ${p.release}` : ""}. It was reopened and moved to Todo.`,
	},
	aiKey: {
		subject: "Your AI key for duplicate suggestions stopped working",
		workspaceFallback: "your workspace",
		refusal: {
			401: "the key is invalid or was revoked",
			402: "the account is out of credit",
			403: "the key is not allowed to use this model",
			429: "the account is over its rate limit or quota",
		} as Record<number, string>,
		text: (p: {
			provider: string;
			workspace: string;
			status: number;
			meaning?: string;
		}) =>
			`${p.provider} keeps refusing the AI key of ${p.workspace}: HTTP ${p.status}${p.meaning ? `, ${p.meaning}` : ""}.\n\nUntil it works again, duplicates are only suggested for near-identical wording. Check the key, its credit or quota, then press Test.`,
		action: "Open the AI settings",
	},
	webhook: {
		what: WHAT,
		subject: (p: { what: "discord" | "slack" | "json"; project: string }) =>
			`A ${WHAT[p.what]} of ${p.project} keeps failing`,
		hostFallback: "the endpoint",
		text: (p: {
			what: "discord" | "slack" | "json";
			event: string;
			host: string;
			error: string;
		}) =>
			`Tattle gave up sending ${p.event} to the ${WHAT[p.what]} at ${p.host} after 6 attempts. Last error: ${p.error}.\n\nLater events are still sent to it. You won't get this email again until a delivery to it works.`,
		action: (chat: boolean) =>
			`Open the ${chat ? "channel" : "webhook"} settings`,
	},
	reporterReplied: {
		subject: (p: { number: number; title: string }) =>
			`Reporter answered: #${p.number} ${p.title}`,
		reporterFallback: "The reporter",
		intro: (p: {
			who: string;
			number: number;
			title: string;
			project: string;
			count: number;
		}) =>
			`${p.who}, who reported #${p.number} “${p.title}” in ${p.project}, wrote${p.count > 1 ? ` ${p.count} messages` : ""}:`,
		outro:
			"Written by the reporter, not by your team. Answer from the issue page.",
	},
	digest: {
		subjectOne: (p: { count: number; project: string }) =>
			`Triage: ${p.count} new in ${p.project}`,
		subjectMany: (count: number) =>
			p(count, { one: "Triage: # new issue", other: "Triage: # new issues" }),
		text: "New since the last digest and waiting in Triage:",
		listTitle: (p: { project: string; count: number }) =>
			`${p.project}: ${p.count} new`,
		more: (count: number) => `and ${count} more`,
		action: "Open Triage",
	},
	reporter: {
		footer: "You get this email because you sent this report.",
		stop: "Stop emails about this report",
	},
	reply: {
		subject: (title: string) => `Re: ${title}`,
		teamFallback: "the team",
		text: (p: {
			actor: string;
			project: string;
			body: string;
			title: string;
		}) =>
			`${p.actor} from ${p.project} replied to your report:\n\n${p.body}\n\nYou wrote: “${p.title}”`,
		action: "Read and reply",
	},
	shipped: {
		subject: (title: string) => `Shipped: ${title}`,
		text: (p: { project: string; title: string }) =>
			`You asked ${p.project} for “${p.title}”. It's now available.\n\nThanks for taking the time to ask: it's how we decide what to build next.`,
		action: "See what else is coming",
	},
	invitation: {
		workspaceFallback: "their workspace",
		subject: (p: { inviter: string; workspace: string }) =>
			`${p.inviter} invited you to ${p.workspace} on Tattle`,
		text: (p: { inviter: string; workspace: string; email: string }) =>
			`${p.inviter} invited you to join ${p.workspace} on Tattle, where your team triages bug reports and feature requests.\n\nCreate your account with this email address (${p.email}) within 7 days.`,
		action: "Accept the invitation",
	},
	passwordReset: {
		subject: "Reset your Tattle password",
		text: (name: string) =>
			`Hi ${name},\n\nSomeone asked to reset the password of your Tattle account. If it was you, choose a new password with the button below. The link works for one hour.\n\nIf it wasn't you, ignore this email: your password stays the same.`,
		action: "Choose a new password",
	},
};
