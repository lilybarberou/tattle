import { pluralizer } from "../../format";

const p = pluralizer("en");

/** Workspace pages: Members, Agents & API, Privacy, Notifications. */
export const workspace = {
	members: {
		title: "Members",
		description: (count: number, organization: string) =>
			`${p(count, { one: "# person", other: "# people" })} in ${organization}. Sign-up is closed: people join with an invitation.`,
		peopleTitle: "People",
		peopleDescription:
			"Everyone here sees every project, triages reports and can create API tokens for agents.",
		inviteTitle: "Invite someone",
		inviteDescription:
			"We email the invitation when SMTP is set up on this server; the link works too. It is valid 7 days: they create their account with that email and join right away.",
		invitationEmailed: "Invitation sent by email",
		invitationFailed: "Invitation failed",
		email: "Email",
		emailPlaceholder: "camille@atelier-nord.fr",
		role: "Role",
		createInvitation: "Create invitation",
		onlyAdminsInvite: "Only owners and admins can invite people.",
		invitationLink: (email: string) =>
			`Invitation link for ${email} (also usable if the email gets lost)`,
		waiting: "Waiting to join",
		expires: "expires",
		linkUnavailable: "Link unavailable",
		showLink: "Show link",
		invitationCanceled: "Invitation canceled",
		cancel: "Cancel",
	},
	agents: {
		title: "Agents & API",
		description: (organization: string) =>
			`Tokens work for every project of ${organization}. An agent acts under its token's name.`,
		agentsTitle: "Agents",
		agentsDescription:
			"Each token is an agent you can assign issues to. Assigning one sends it an issue.updated webhook.",
		noAgent: "No agent yet. Create a token below to connect one.",
		readsAndChanges: "Reads and changes issues",
		readOnly: "Read only",
		active: "active",
		neverUsed: "never used",
		revoked: (name: string) => `${name} can no longer connect`,
		notRevoked: "Not revoked",
		revoke: "Revoke",
		createFailed: "Could not create the token",
		newAgent: "New agent",
		namePlaceholder: "Triage bot",
		canWrite: "Can change issues (otherwise read only)",
		createToken: "Create token",
		copyNow: "Copy this token now. It is shown only once.",
		oauthTitle: "Connect your own MCP client",
		oauthDescription:
			"Claude Code, Cursor and other MCP clients sign you in through the browser: no token to copy. They act as you.",
		noApp: "No app connected with your account yet.",
		app: "App",
		unnamedApp: "Unnamed app",
		connected: "Connected",
		disconnected: (name: string | null) =>
			`${name ?? "The app"} was disconnected`,
		disconnect: "Disconnect",
		tokenTitle: "Connect an agent with a token",
		tokenDescription:
			"For bots and scripts that run without a browser. Paste one of these where the agent reads its MCP servers.",
		anyClient: "Any MCP client",
		duplicatesTitle: "Duplicate suggestions",
		duplicatesIntro:
			"Each new report is compared with the project's most similar issues. Without AI, only a near-identical wording is suggested.",
		duplicatesDetail:
			"With your own key, the model judges whether they describe the same problem. It receives the report's message, page URL and console errors, and the title and description of up to 8 similar issues. Nothing is sent while this is off.",
		toolsTitle: "What an agent can do",
		toolsDescription:
			"Report text is written by your users. The server tells agents to treat it as data, never as instructions.",
		tools: {
			list_issues: "The Triage queue and every other view",
			search_issues: "Find similar issues before merging",
			get_issue:
				"An issue with its comments, activity and duplicate suggestion",
			get_report: "Logs, device, account and the screenshot as an image",
			update_issue: "Status, priority, labels, assignee, pull request",
			mark_duplicate: "Merge into the original, reports included",
			add_comment: "Explain a decision on the issue",
			create_issue: "Open an issue it found itself",
		},
	},
	ai: {
		openaiCompatible: "OpenAI-compatible",
		on: (provider: string, model: string) => `On: ${provider}, ${model}. `,
		off: "Off: only near-identical wording is suggested. ",
		onlyAdmins: "Only owners and admins can change it.",
		usesYourAi: "Duplicate suggestions use your AI",
		settingsSaved: "Settings saved",
		judge: "Judge duplicates with AI",
		provider: "Provider",
		baseUrl: "Base URL",
		baseUrlBefore: "The address before",
		baseUrlHelp:
			", e.g. https://openrouter.ai/api/v1. Addresses on the server's own machine or private network, like http://localhost:11434/v1 for Ollama, need",
		baseUrlAfter: "on the server.",
		model: "Model",
		apiKey: "API key",
		savedKey: (last4: string) => `Saved: ••••${last4}`,
		pasteKey: "Paste the key",
		keyHelp: {
			anthropic: "From console.anthropic.com → API keys.",
			openai: "From platform.openai.com → API keys.",
			openai_compatible:
				"Mistral, OpenRouter, Ollama, LM Studio… Leave the key empty if the server needs none.",
		},
		storedEncrypted: "It is stored encrypted and never shown again.",
		keepSavedKey: " Leave the field empty to keep the saved key.",
		keyUnreadable:
			"The saved key can no longer be read: the server secret changed. Paste it again.",
		testFailed: "Test failed",
		testing: "Testing…",
		test: "Test",
		removed: "AI settings and key removed",
		notRemoved: "Not removed",
		removeKey: "Remove key",
		answered: (model: string) => `${model} answered.`,
	},
	privacy: {
		title: "Privacy",
		description:
			"Find, export or erase what the widget collected about one person, and decide how long reports keep their screenshots and logs.",
		personTitle: "One person's data",
		personDescription:
			"For an access or erasure request (GDPR). Search by the email or the user id your app gives the widget. Covers every project of this workspace.",
		exportFailed: "Export failed",
		searchFailed: "Search failed",
		query: "Email or user id",
		queryPlaceholder: "lea.martin@gmail.com",
		find: "Find",
		nothingStored: (query: string) => `Nothing stored for “${query}”.`,
		reports: (count: number) => p(count, { one: "report", other: "reports" }),
		inProjects: (projects: string) => ` in ${projects}`,
		votes: (count: number) => p(count, { one: "vote", other: "votes" }),
		onPublicPages: " on public pages.",
		onlyAdmins: "Only owners and admins can export or erase someone's data.",
		download: "Download as JSON",
		erase: "Erase…",
		erased: (r: {
			reports: number;
			messages: number;
			votes: number;
			issues: number;
		}) =>
			`Erased ${r.reports} reports, ${r.messages} messages and ${r.votes} votes; ${r.issues} issues they opened were deleted`,
		notErased: "Not erased",
		eraseForGood: (count: number) => `Erase ${count} items for good`,
		keep: "Keep them",
		eraseExplained:
			"Their reports, screenshots and votes are deleted. An issue only they reported is deleted too, since its title is their words; issues others also reported stay.",
		retentionTitle: "How long reports are kept",
		retentionSet: "Set",
		retentionDescription:
			"on the server to drop screenshots and logs of older reports. The message and the reporter stay, so issues keep their history.",
		retentionDays: (days: number) =>
			`Screenshots, console and network logs are deleted ${days} days after a report arrives.`,
		retentionNone:
			"Reports keep their screenshots and logs until you delete them.",
		collectedTitle: "What the widget collects",
		collectedDescription:
			"Useful for your privacy policy: list this under the tool you use for bug reports.",
		collected: {
			account: {
				term: "Account",
				text: "What your app passes to identify(): id, email, name and any traits.",
			},
			message: {
				term: "Message and screenshot",
				text: "What the person wrote, and the annotated screenshot if they took one. Password and card fields are masked.",
			},
			console: {
				term: "Console",
				text: "The last 200 console messages and JavaScript errors on the page.",
			},
			network: {
				term: "Network",
				text: "The last 100 requests: method, URL, status, duration. No bodies or headers; tokens in URLs are redacted.",
			},
			device: {
				term: "Device",
				text: "Browser, system, screen and window size, language, time zone.",
			},
			votes: {
				term: "Portal votes",
				text: "A random id in a cookie, and an email only if the visitor leaves one.",
			},
		},
	},
	notifications: {
		title: "Notifications",
		description: (email: string) =>
			`Emails to ${email} for things you need to act on. Discord, Slack and webhooks cover everything else.`,
		noSmtp:
			"This server has no SMTP settings, so no email is sent. Your choices are kept for when it does.",
		sentAround: (hour: string) => `Sent around ${hour}.`,
		workTitle: "Your work",
		workDescription:
			"Never for what you did yourself. Every email also has a link to stop its kind.",
		digestTitle: "Digest",
		digestDescription:
			"One email a day at most, only when something new waits in Triage.",
		healthTitle: "Workspace health",
		healthDescription:
			"For owners and admins: when something set up for the workspace stops working.",
	},
};
