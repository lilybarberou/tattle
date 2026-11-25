import { pluralizer } from "../../format";

const p = pluralizer("en");

/** Pages without an account: the portal, a reporter's thread, unsubscribe. */
export const publicPages = {
	linkBroken: "This link doesn't work",
	linkBrokenHelp:
		"It may be incomplete: open it again from the email, without changing it.",
	portal: {
		title: "Feature requests",
		pageTitle: (project: string) => `${project} · Feature requests`,
		notPublished: "This page isn't published",
		notPublishedHelp:
			"The address may be wrong, or the team turned this page off.",
		status: {
			backlog: "Considering",
			todo: "Planned",
			in_progress: "In progress",
			in_review: "In progress",
			done: "Shipped",
		},
		voteNotSaved: "Your vote wasn't saved",
		voteLabel: "Vote, ",
		votes: (count: number) => p(count, { one: " vote", other: " votes" }),
		intro:
			"Vote for what you want next, or suggest something new. We read every idea.",
		suggest: "Suggest an idea",
		views: "Views",
		open: "Open",
		shipped: "Shipped",
		emailWhenShips: "We'll email you when it ships",
		notifyQuestion: (title: string) => `Get an email when “${title}” ships?`,
		emailPlaceholder: "you@company.com",
		notifyMe: "Notify me",
		noThanks: "No thanks",
		nothingShipped: "Nothing shipped from this list yet.",
		noIdeas: "No ideas yet. Be the first to suggest one.",
		privacy:
			"Your votes are remembered in this browser. We only use your email to tell you when an idea ships.",
		thanks: "Thanks! The team will review your idea.",
		suggestIntro: "The team reviews new ideas before they appear on this page.",
		ideaTitle: "Your idea in one line",
		ideaDescription: "What would it help you do?",
		ideaEmail: "Email (optional)",
		ideaEmailPlaceholder: "To hear when it ships",
		send: "Send the idea",
	},
	thread: {
		pageTitle: (project: string) => `${project} · Your report`,
		title: "Your report",
		expired: "This link has expired",
		expiredHelp:
			"Links in our emails work for 30 days. The next reply from the team brings a new one, and the app's feedback button shows your reports too.",
		sent: "Sent. The team will read it.",
		bugSent: "Bug report sent",
		ideaSent: "Idea sent",
		you: "You",
		yourReply: "Your reply",
		placeholder: "Write to the team…",
		send: "Send",
		footer:
			"Anyone with this link can read this conversation and reply. It works for 30 days.",
	},
	unsubscribe: {
		pageTitle: "Unsubscribe",
		reportDone: "You won't get emails about this report",
		reportAsk: "Stop emails?",
		reportDoneText: (project: string) =>
			`${project} won't email you about it anymore. Replies still show in the app's feedback button.`,
		reportAskText: (project: string, title: string) =>
			`About your report to ${project}: “${title}”. You won't get the team's replies or the notice when it's fixed by email.`,
		stopReport: "Stop emails about this report",
		done: "Unsubscribed",
		ask: "Unsubscribe?",
		doneText: (label: string) => `You won't get “${label}” emails anymore.`,
		askText: (label: string) =>
			`You'll stop getting “${label}” emails from Tattle.`,
		turnBackOn:
			"Turn them back on, or others off, in your notification settings.",
		unsubscribe: "Unsubscribe",
		settings: "Notification settings",
	},
};
