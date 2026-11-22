import { numberer, pluralizer } from "../../format";

const p = pluralizer("en");
const n = numberer("en");

/** The Overview page and its reports chart. */
export const overview = {
	title: "Overview",
	description: {
		nothing: "Nothing reported in the last 30 days.",
		reports: (count: number) =>
			`${p(count, { one: "# report", other: "# reports" })} in the last 30 days`,
		end: ".",
		same: ", as many as the 30 days before.",
		up: (previous: number) => `, up from ${n(previous)}.`,
		down: (previous: number) => `, down from ${n(previous)}.`,
		triageClear: "Triage is clear.",
		waiting: (count: number) =>
			`${p(count, { one: "# issue", other: "# issues" })} waiting in Triage.`,
	},
	reports30: "Reports, 30 days",
	noneYet: "None yet",
	previous30: (count: number) => `${n(count)} the 30 days before`,
	inTriage: "In triage",
	oldestArrived: "Oldest arrived",
	inboxClear: "Inbox clear",
	resolved30: "Resolved, 30 days",
	over90: (value: string) => `${value} over 90 days`,
	medianTime: "Median time to resolve",
	nothingDone: "Nothing moved to Done yet",
	duration: {
		minutes: (count: number) => `${n(count)} min`,
		hours: (count: number) => `${n(count)} h`,
		days: (count: number) => `${n(count)} ${count === 1 ? "day" : "days"}`,
	},
	perDay: "Reports per day",
	perDayAside: (count: number) =>
		`Last 30 days, UTC · ${p(count, { one: "# report", other: "# reports" })}`,
	noReports:
		"No reports in the last 30 days. When people send a bug or an idea from the widget, each day shows up here.",
	openIssues: "Open issues",
	issues: (count: number) => p(count, { one: "# issue", other: "# issues" }),
	mostReported: "Most reported",
	noReported:
		"No open issue has reports yet. Issues that many people run into rise to the top here.",
	reports: (count: number) => p(count, { one: "# report", other: "# reports" }),
	mostVoted: "Most voted requests",
	fromPublicPage: "From the public page",
	votes: (count: number) => p(count, { one: "# vote", other: "# votes" }),
	chart: {
		bugs: "Bugs",
		features: "Feature requests",
		slider: "Reports per day, last 30 days",
		day: (date: string, bugs: number, features: number) =>
			`${date}: ${p(bugs, { one: "# bug", other: "# bugs" })}, ${p(features, { one: "# feature request", other: "# feature requests" })}`,
		caption: "Reports per day",
		dayColumn: "Day",
	},
};
