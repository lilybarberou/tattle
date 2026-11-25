/**
 * Errors the server sends back. The English text is also what the REST API,
 * MCP and the logs say: keep it stable.
 */
export const errors = {
	internal: "Internal server error",
	onlyPeopleHaveSettings: "Only people have settings",

	// Signing in and access
	notSignedIn: "Not signed in",
	unknownUser: "Unknown user",
	invalidApiToken: "Invalid API token",
	appDisconnected: "This app was disconnected",
	tokenReadOnly: "This API token is read-only",
	notAMember: "Not a member of this organization",
	onlyAdmins: "Only owners and admins can do this",
	onlyAdminsInvite: "Only owners and admins can invite people",
	onlyAdminsRevokeToken:
		"Only owners and admins can revoke someone else's token",
	onlyAdminsAiSettings: "Only owners and admins can change the AI settings",
	onlyMembersCreateTokens: "Only members can create tokens",
	onlyPeopleHaveNotificationSettings: "Only people have notification settings",
	signInFirst: "Sign in first",

	// Projects
	projectNotFound: "Project not found",
	projectNotCreated: "Project could not be created",
	unknownProjectKey: "Unknown project key",
	originNotAllowed: "This origin is not allowed for this project",
	invalidOrigin: (p: { origin: string }) =>
		`"${p.origin}" is not an origin. Write it as scheme and host only, like https://shop.atelier-nord.fr`,
	invalidPortalSlug:
		"The address takes 3 to 40 lowercase letters, digits or dashes.",
	portalSlugTaken: "This address is already taken.",
	confirmProjectName: (p: { name: string }) =>
		`Type the project's name, “${p.name}”, to confirm.`,

	// Members
	unknownMember: "Unknown member",
	unknownAgent: "Unknown agent",
	invitationGone:
		"This invitation was used, canceled or has expired. Create a new one.",

	// Issues and reports
	issueNotFound: "Issue not found",
	issueNumberNotFound: (p: { number: number }) =>
		`Issue #${p.number} not found`,
	reportNotFound: "Report not found",
	reportNotSaved: "Report could not be saved",
	fileNotFound: "File not found",
	titleRequired: "Title is required",
	titleEmpty: "Title cannot be empty",
	titleTooLong: (p: { max: number }) =>
		`A title takes at most ${p.max} characters`,
	descriptionTooLong: (p: { max: number }) =>
		`A description takes at most ${p.max.toLocaleString("en")} characters`,
	commentEmpty: "Comment cannot be empty",
	commentTooLong: (p: { max: number }) =>
		`A comment takes at most ${p.max.toLocaleString("en")} characters`,
	prUrlInvalid: "The pull request URL must start with http:// or https://",
	useMarkDuplicate: "Use mark_duplicate to mark an issue as a duplicate",
	priorityRange: "Priority must be an integer from 0 to 4",
	cannotDuplicateItself: "An issue cannot duplicate itself",
	duplicateOfDuplicate: (p: { number: number }) =>
		`#${p.number} is itself a duplicate; use its original instead`,
	reporterKeyInvalid:
		"reporterKey must be 32 to 128 letters, digits, dashes or underscores",
	screenshotFormat: "Screenshot must be a PNG, JPEG or WebP data URL",
	screenshotTooLarge: "Screenshot is larger than 8 MB",

	// Conversations with reporters
	writeMessageFirst: "Write a message first",
	messageTooLong: (p: { max: number }) =>
		`Messages are limited to ${p.max} characters`,
	messageNotSaved: "The message could not be saved",
	onlyPeopleAndAgentsReply: "Only people and agents can reply",
	linkExpired: "This link has expired",
	unknownLink: "Unknown link",
	tooManyMessages: "Too many messages. Try again in a few minutes.",

	// Public feature requests
	portalPageNotFound: "This page does not exist",
	requestNotPublic: "This request is not public",
	alreadyShipped: "This one has shipped already",
	voteFirst: "Vote first",
	tooManyActions: "Too many actions. Try again in a few minutes.",

	// Webhooks
	webhookUrlRequired: "Enter the endpoint's http or https URL",
	webhookNotCreated: "Webhook could not be created",
	privateWebhookRefused:
		"This address is on the server's own machine or private network. To send webhooks there, set ALLOW_PRIVATE_URLS=true on the server",

	// Workspace AI
	aiBaseUrlRequired:
		"Enter the server's base URL, e.g. https://api.mistral.ai/v1 or http://localhost:11434/v1",
	privateAiUrlRefused:
		"This address is on the server's own machine or private network. To use a model there (Ollama, LM Studio…), set ALLOW_PRIVATE_URLS=true on the server",
	aiModelRequired: "Enter the model to use",
	aiModelTooLong: "That model name is too long",
	aiKeyTooLong: "That key is too long",
	aiKeyRequired: (p: { provider: string }) =>
		`Add your ${p.provider} API key to turn suggestions on`,
	wrongSetupCode:
		"Wrong setup code. It is in the server logs, on the line that starts with [setup].",
	signupClosed:
		"Sign-up is closed on this server. Open the invitation link you were sent, or ask a member to invite your email address.",
};
