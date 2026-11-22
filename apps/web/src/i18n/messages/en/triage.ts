import { pluralizer } from "../../format";

const p = pluralizer("en");

/** Triage, Feature requests, duplicate suggestions and the merge dialog. */
export const triage = {
	title: "Triage",
	anonymous: "Anonymous",
	errors: (count: number) => p(count, { one: "# error", other: "# errors" }),
	failed: (count: string) => `${count} failed`,
	hasScreenshot: "Has a screenshot",
	accepted: (number: number) => `#${number} accepted into Backlog`,
	declined: (number: number) => `#${number} declined`,
	merged: (number: number, original: number) =>
		`#${number} merged into #${original}`,
	queueLabel: "Reports waiting for a decision",
	nothingWaiting: "Nothing is waiting for a decision.",
	withErrors: (count: string, total: string) =>
		`${count} of ${total} came with console errors or failed requests.`,
	newOldestFirst: (count: string) => `${count} new, oldest first.`,
	emptyText:
		"New reports from the widget land here. Your agent can sort them too, through MCP.",
	installWidget: "Install the widget",
	recentlyDecided: "Recently decided",
	keyMove: "move",
	keyAccept: "accept",
	keyMerge: "merge",
	keyDecline: "decline",
	selectedLabel: "Selected report",
	backToQueue: "Back to the queue",
	position: (index: string, total: string) => `${index} of ${total}`,
	accept: "Accept",
	merge: "Merge",
	decline: "Decline",
	openFullIssue: "Open the full issue",
	peopleReported: (count: number) =>
		p(count, {
			one: "# person reported this.",
			other: "# people reported this.",
		}),
	seeEveryReport: "See every report",
	decisionLabel: "Decision",
	setBeforeAccepting: "Set before accepting",
	writtenInDashboard: "This issue was written in the dashboard.",
	allCaughtUp: "All caught up.",
	seeOpenIssues: "See open issues",
	duplicate: {
		label: "Possible duplicate",
		looksLike: "Looks like",
		byAi: "suggested by your AI",
		byText: "near-identical wording",
		mergeInto: (number: number) => `Merge into #${number}`,
		notDuplicate: "Not a duplicate",
	},
	mergeDialog: {
		title: (number: number | undefined) => `Merge #${number ?? ""} into…`,
		description:
			"Its reports move to the issue you pick, so you keep everyone who hit the problem.",
		placeholder: "Search by words or #number",
		searching: "Searching…",
		noResult: "No similar issue. Try other words.",
		results: "Results",
		similar: "Similar issues",
	},
	requests: {
		title: "Feature requests",
		shippedCount: (count: string) => `${count} shipped.`,
		summary: (people: number, ideas: string, leader: string, demand: string) =>
			`${p(people, { one: "# request", other: "# requests" })} across ${ideas} ideas. Most asked: “${leader}” (${demand}).`,
		newRequest: "New request",
		views: "Views",
		mostRequested: "Most requested",
		shipped: "Shipped",
		emptyShipped:
			"Nothing shipped yet. Requests you mark Done land here, so you can tell the people who asked.",
		emptyOpen:
			"No open requests. Users send ideas from the widget's “Suggest an idea” tab; similar ideas merged together add up here.",
		people: (count: number) => p(count, { one: "person", other: "people" }),
	},
};
