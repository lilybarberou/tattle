/** Project settings. */
export const settings = {
	title: "Project settings",
	description: (name: string, key: string) => `${name} · public key ${key}`,
	ownersAndAdminsOnly: "Only owners and admins can change this.",
	general: {
		title: "General",
		description:
			"The project's name, shown in the sidebar and in webhook payloads.",
		name: "Name",
	},
	install: {
		title: "Install the widget",
		description1:
			"Adds a button to your app. Users report a bug with an annotated screenshot, or suggest an idea.",
		description2:
			"The steps before the report, console errors, failed requests and the device are attached automatically.",
		platform: "Platform",
		tabWeb: "Website",
		tabApi: "Mobile and other apps (API)",
		releaseBefore: "Set",
		releaseAfter:
			"to your app's version on each deploy: issues show the releases they were seen in, and a done bug reported again is reopened as a regression.",
		identify: "Then identify the signed-in user",
		identifyComment: "After sign-in, so every report says who sent it:",
		apiBefore:
			"Swift, Kotlin, Flutter, React Native or a backend: send reports with one JSON request. The",
		apiLink: "ingest API reference",
		apiAfter: "lists every field.",
	},
	origins: {
		title: "Allowed sites",
		anySite:
			"Any site can send reports with this key. Fine while testing; list your app's address before you go live.",
		onlyThese: "Only these sites can send reports with this key.",
		mobile: "Mobile apps are not affected: they send no site address.",
		label: "One address per line",
		save: "Save sites",
	},
	identity: {
		title: "Verified identity",
		description1:
			"People follow their reports and talk with you from the widget. By default, each device sees the reports sent from it.",
		description2:
			"Turn this on so a signed-in user sees all their reports, on every device: your server signs their id with this secret and the widget passes the signature along. A user id without a valid signature never opens anyone's reports.",
		description3:
			"While it is on, a report sent by a verified user is theirs only: the device it came from no longer lists it on its own. Replacing the secret breaks every signature made with the old one, so until your server signs with the new secret, signed-in users see only what their device sent without signing in. Turning it off gives each device back every report sent from it, verified or not.",
		secret: "Identity secret: keep it on your server",
		server: "On your server, for the signed-in user (Node)",
		serverComment:
			"Send it to the page with the rest of the signed-in user's data.",
		otherLanguage:
			"Any other language: the HMAC-SHA256 of the user id with this secret, in hex. In PHP,",
		client: "Then in your app, with the same id",
		replaced:
			"New secret. Update your server: signatures made with the old one no longer work, and until then signed-in users only see what their device sent without signing in.",
		replace: "Replace the secret",
		turnedOff:
			"Verified identity is off. Each device sees every report sent from it, verified or not.",
		turnOff: "Turn off",
		turnedOn: "Verified identity is on. Add the signature on your server.",
		turnOn: "Turn on verified identity",
		state: (on: boolean) =>
			`Verified identity is ${on ? "on" : "off"}. Only owners and admins can see the secret or change this.`,
	},
	chat: {
		title: "Discord and Slack",
		description1:
			"Posts new reports, status and assignee changes, and comments to a channel.",
		description2:
			"Discord: channel settings → Integrations → Webhooks → New webhook → Copy URL. Slack: an Incoming Webhook URL.",
		testSent: "Test message sent",
		testFailed: (error: string) => `Test failed: ${error}`,
		sendTest: "Send a test",
		remove: "Remove this channel",
		removed: "Channel removed",
		ownersOnly: "Only owners and admins can add or remove channels.",
		added: (service: string) => `${service} channel added`,
		addFailed: "Could not add the channel",
		url: "Webhook URL",
		add: "Add channel",
		language: "Language",
		languageHelp:
			"Discord and Slack messages of this project are written in this language.",
	},
	webhooks: {
		title: "Webhooks",
		description1:
			"We POST each event as JSON to your agent or server, and retry 5 times if it fails.",
		checkBefore: "Check the",
		checkMiddle: "header: an HMAC-SHA256 of",
		checkAfter: "with the secret.",
		eventHelp: {
			"report.created": "A user sent a report from the widget",
			"issue.created": "An issue was opened, from a report or by hand",
			"issue.updated": "Status, priority, labels, assignee or PR changed",
			"comment.created": "Someone, or an agent, commented",
			"message.created":
				"A reporter wrote to the team, or the team replied to a reporter",
		},
		pingDelivered: (status: number) => `Ping delivered (HTTP ${status})`,
		pingFailed: (error: string) => `Ping failed: ${error}`,
		delete: "Delete this webhook",
		deleted: "Webhook deleted",
		everyEvent: "Every event",
		signingSecret: "Signing secret",
		ownersOnly:
			"Only owners and admins can add, remove or see the secret of a webhook.",
		added: "Webhook added",
		addFailed: "Could not add the webhook",
		endpoint: "Add an endpoint",
		events: "Events, or none for every event",
		add: "Add webhook",
		recent: "Recent deliveries",
		event: "Event",
		result: "Result",
		tries: "Tries",
		when: "When",
		delivered: "Delivered",
		failed: "Failed",
		retrying: "Retrying",
	},
	github: {
		title: "GitHub",
		description1:
			"Moves an issue to Done when its pull request is merged into the repository's default branch, so nobody has to do it by hand. Reporters of a shipped feature get their email as usual.",
		linkedBefore:
			"A pull request is linked when it is the issue's PR (agents set it with",
		linkedMiddle: "), or when its title or description says",
		linkedOr: "(or",
		linkedAfter:
			": fix, close or resolve in any form, right before the reference; a bare mention links nothing, and a plain #12 is GitHub's own issue). Opening such a pull request links it and moves the issue from Todo or In progress to In review. An issue whose pull request is another one is left alone.",
		turnedOn: "GitHub sync turned on",
		turnedOff: "GitHub sync turned off",
		toggle: "Move issues to Done when their pull request is merged",
		step1: "In your repository on GitHub:",
		step1Path: "Settings → Webhooks → Add webhook",
		payloadUrl: "Payload URL",
		step2: ": the address below.",
		contentType: "Content type",
		colon: ":",
		secret: "Secret",
		step4: ": the secret below.",
		selectEvents: "Let me select individual events",
		step5Check: ", check",
		pullRequests: "Pull requests",
		step5Then: "only, then",
		addWebhook: "Add webhook",
		step5Ping: ". GitHub sends a ping right away.",
		newSecretCreated: "New secret created: paste it in GitHub",
		newSecret: "New secret",
		oldStops: "The old one stops working at once.",
		lastDelivery: "Last delivery",
	},
	portal: {
		title: "Public feature requests",
		description:
			"A public page where anyone can see what you plan, vote for ideas and suggest new ones. Only requests you accepted from Triage appear there.",
		publish: "Publish the page",
		address: "Address",
		open: "Open the public page",
	},
	danger: {
		title: "Delete this project",
		description:
			"Deletes every issue, report, screenshot, webhook and vote of this project. The widget stops accepting reports. This cannot be undone.",
		deleted: (name: string) => `${name} was deleted`,
		typeBefore: "Type",
		typeAfter: "to confirm",
		delete: (name: string) => `Delete ${name}`,
	},
};
