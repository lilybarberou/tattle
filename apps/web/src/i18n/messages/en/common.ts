import { pluralizer } from "../../format";

const p = pluralizer("en");

/** Words every part of the app uses. Product terms live here, once. */
export const common = {
	product: "Tattle",
	tagline:
		"Bug reports and feature requests from your users, triaged by your agents.",
	status: {
		triage: "Triage",
		backlog: "Backlog",
		todo: "Todo",
		in_progress: "In progress",
		in_review: "In review",
		done: "Done",
		canceled: "Declined",
		duplicate: "Duplicate",
	},
	statusHint: {
		triage: "New, not decided yet",
		backlog: "Accepted, not planned",
		todo: "Planned next",
		in_progress: "Someone is on it",
		in_review: "Fix waiting for review",
		done: "Fixed or shipped",
		canceled: "Won't do",
		duplicate: "Merged into another issue",
	},
	priority: {
		none: "No priority",
		urgent: "Urgent",
		high: "High",
		medium: "Medium",
		low: "Low",
	},
	type: { bug: "Bug", feature: "Feature request" },
	/** An issue's status in the words of the person who reported it. */
	reporterStatus: {
		received: "Received",
		planned: "Planned",
		in_progress: "In progress",
		fixed: "Fixed",
		wont_fix: "Won't fix",
	},
	role: { owner: "Owner", admin: "Admin", member: "Member" },
	actions: {
		save: "Save",
		saving: "Saving…",
		saved: "Saved",
		cancel: "Cancel",
		delete: "Delete",
		remove: "Remove",
		close: "Close",
		copy: "Copy",
		copied: "Copied",
		edit: "Edit",
		retry: "Try again",
		back: "Back",
		continue: "Continue",
		send: "Send",
		sending: "Sending…",
		search: "Search",
		confirm: "Confirm",
	},
	errors: {
		generic: "Something went wrong",
		notSaved: "Not saved",
		notSent: "Not sent",
		couldNotSave: "Could not save",
		couldNotDelete: "Could not delete",
		copyFailed: "Could not copy",
	},
	you: "You",
	someone: "Someone",
	nobody: "Nobody",
	/** "Ada (agent)": an API token acting as a person. */
	agentName: (name: string) => `${name} (agent)`,
	reports: (count: number) => p(count, { one: "# report", other: "# reports" }),
	issues: (count: number) => p(count, { one: "# issue", other: "# issues" }),
	/** The emails Tattle sends team members (shared/notifications.ts). */
	notificationType: {
		reporter_replied: {
			label: "A reporter answered",
			description: (minutes: number) =>
				`When someone who sent a report writes back. It goes to the issue's assignee; when nobody is assigned, to the team members who replied in that conversation, or else to owners and admins. Messages within ${minutes} minutes come as one email.`,
		},
		assigned: {
			label: "Assigned to you",
			description:
				"When someone else or an agent assigns an issue to you. Never when you assign yourself.",
		},
		regression: {
			label: "A fixed bug came back",
			description:
				"When a bug marked done gets a newer report and is reopened. It goes to the assignee, or to owners and admins when nobody is assigned.",
		},
		triage_digest: {
			label: "Daily triage digest",
			description:
				"Once a day, the new issues waiting in Triage in each project, only on days with something new. On by default for owners and admins.",
		},
		ai_key_failing: {
			label: "The AI key stopped working",
			description:
				"When the AI provider keeps refusing the workspace's key (revoked, out of credit, over quota). At most once a day.",
		},
		webhook_failing: {
			label: "A webhook keeps failing",
			description:
				"When a webhook, Discord or Slack channel still fails after its retries. Once, until a delivery to it works again.",
		},
	},
	language: {
		label: "Language",
		auto: "Auto (browser language)",
		description:
			"The dashboard and the emails Tattle sends you. Auto follows your browser.",
	},
};
