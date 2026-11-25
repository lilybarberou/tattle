import { pluralizer } from "../../format";

const p = pluralizer("en");

const TYPE = { bug: "Bug", feature: "Idea" };

/** Discord and Slack messages, in the project's chat language. */
export const chat = {
	ping: {
		title: "Tattle is connected",
		text: "New reports, status changes and comments will appear in this channel.",
	},
	someone: "Someone",
	type: TYPE,
	reportTitle: (p: {
		type: "bug" | "feature";
		number: number;
		title: string;
	}) => `${TYPE[p.type]} #${p.number}: ${p.title}`,
	consoleErrors: (count: number) =>
		p(count, { one: "# console error", other: "# console errors" }),
	failedRequests: (count: number) =>
		p(count, { one: "# failed request", other: "# failed requests" }),
	screenshot: "screenshot attached",
	from: "From",
	page: "Page",
	screen: "Screen",
	evidence: "Evidence",
	opened: (p: { number: number; title: string }) =>
		`#${p.number} opened: ${p.title}`,
	openedBy: (p: { actor: string; type: "bug" | "feature" }) =>
		`${p.actor} opened a ${p.type === "bug" ? "bug" : "feature request"}.`,
	mergedInto: (p: { number: number; title: string }) =>
		`Merged into #${p.number} ${p.title}`,
	assignedTo: (name: string) => `Assigned to **${name}**`,
	unassigned: "Unassigned",
	pullRequest: (url: string) => `Pull request: ${url}`,
	commentOn: (p: { number: number; title: string }) =>
		`Comment on #${p.number} ${p.title}`,
	reporterReplied: (p: { number: number; title: string }) =>
		`Reporter replied on #${p.number} ${p.title}`,
	replyToReporter: (p: { number: number; title: string }) =>
		`Reply to the reporter on #${p.number} ${p.title}`,
	agent: "agent",
};
