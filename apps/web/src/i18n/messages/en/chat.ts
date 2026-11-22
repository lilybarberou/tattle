import { pluralizer } from "../../format";

const p = pluralizer("en");

/** Discord and Slack messages, in the project's chat language. */
export const chat = {
	ping: {
		title: "Tattle is connected",
		text: "New reports, status changes and comments will appear in this channel.",
	},
	someone: "Someone",
	agent: "agent",
	consoleErrors: (count: number) =>
		p(count, { one: "# console error", other: "# console errors" }),
	failedRequests: (count: number) =>
		p(count, { one: "# failed request", other: "# failed requests" }),
	screenshot: "screenshot attached",
	unassigned: "Nobody",
	reportedAfterDone: "reported again after it was done",
	/** Field names: short, a phone shows them above each value. */
	fields: {
		reporter: "Reporter",
		email: "Email",
		userId: "User id",
		page: "Page",
		screen: "Screen",
		device: "Device",
		app: "App",
		release: "Release",
		language: "Language",
		evidence: "Evidence",
		duplicate: "Possible duplicate of",
		type: "Type",
		createdBy: "Created by",
		priority: "Priority",
		labels: "Labels",
		status: "Status",
		mergedInto: "Merged into",
		regression: "Regressed in",
		assignee: "Assignee",
		pullRequest: "Pull request",
		by: "By",
		author: "Author",
		from: "From",
		to: "To",
	},
};
