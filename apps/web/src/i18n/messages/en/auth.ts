/** Sign-in, sign-up, password reset, onboarding and OAuth consent. */
export const auth = {
	/** Better Auth's error codes, shown instead of its English message. */
	errorCodes: {
		INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
		INVALID_EMAIL: "Invalid email",
		INVALID_PASSWORD: "Invalid password",
		USER_ALREADY_EXISTS: "An account already uses this email.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"An account already uses this email. Use another one.",
		PASSWORD_TOO_SHORT: "Password too short",
		PASSWORD_TOO_LONG: "Password too long",
		INVALID_TOKEN: "This link is invalid or has expired",
		ORGANIZATION_ALREADY_EXISTS: "This organization already exists",
	},
	tooManyAttempts: "Too many attempts. Try again in a few minutes.",
	login: {
		signIn: "Sign in",
		createAdmin: "Create the admin account",
		createYours: "Create your account",
		firstAccountIntro:
			"This is the first account on this server. It owns the workspace; sign-up closes after it, and you invite the others.",
		invitedAs: (email: string) => `You were invited as ${email}.`,
		wrongAccountTitle: "This invitation is not for this account",
		signedInAs: "You are signed in as",
		sentToOther: (email: string) =>
			` The invitation was sent to ${email}, or it was already used, canceled or has expired.`,
		sentToAnother:
			" The invitation was sent to another address, or it was already used, canceled or has expired.",
		wrongAccountHelp: (email: string) =>
			`Sign out, then open the link again to join with the invited address. Or ask for a new invitation to ${email}.`,
		signOut: "Sign out",
		goToDashboard: "Go to the dashboard",
		setupCode: "Setup code",
		setupCodeHelpBefore: "In the server logs, on the line that starts with",
		setupCodeHelpAfter: ". It proves you run this server.",
		name: "Name",
		email: "Email",
		password: "Password",
		minLength: (count: number) => `At least ${count} characters.`,
		forgot: "Forgot your password?",
		createAccount: "Create account",
		haveAccount: "Already have an account?",
		noAccount: "No account yet?",
		createOne: "Create one",
		invitationOnly:
			"Accounts are created by invitation. Ask a member of your team.",
	},
	forgot: {
		checkInbox: "Check your inbox",
		sent: (email: string) =>
			`If an account uses ${email}, we sent it a link to choose a new password. The link works for one hour.`,
		backToSignIn: "Back to sign in",
		title: "Reset your password",
		intro:
			"Enter the email of your account. We'll send you a link to choose a new password.",
		notSent: "The email could not be sent",
		send: "Send the link",
	},
	reset: {
		expiredTitle: "This link no longer works",
		expiredIntro: "Reset links work once, for one hour. Ask for a new one.",
		sendNew: "Send a new link",
		title: "Choose a new password",
		different: "The two passwords are different.",
		notChanged: "The password was not changed",
		changed: "Password changed. Sign in with the new one.",
		newPassword: "New password",
		help: (count: number) =>
			`At least ${count} characters. You'll be signed out everywhere else.`,
		repeat: "Repeat it",
		change: "Change password",
	},
	onboarding: {
		orgNotCreated: "Could not create the organization",
		title: "Create a project",
		intro:
			"A project receives the reports of one app. You get its widget snippet right after.",
		organization: "Organization",
		organizationPlaceholder: "Atelier Nord",
		projectName: "Project name",
		projectPlaceholder: "My app",
		create: "Create project",
	},
	consent: {
		scopes: {
			openid: "Know who you are",
			profile: "See your name",
			email: "See your email address",
			offline_access: "Stay connected until you revoke it",
		} as Record<string, string>,
		anMcpClient: "An MCP client",
		title: (name: string) => `Allow ${name}?`,
		actsAs: "It will act as",
		actsAsAfter:
			"through MCP: read issues and reports, triage, comment and update them in your projects.",
		allowing: "Allowing…",
		allow: "Allow",
		deny: "Deny",
		disconnect: "You can disconnect it at any time from Agents & API.",
	},
};
