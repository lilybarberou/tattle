import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { haveIBeenPwned, jwt, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { messages, preferredLocale, resolveVisitorLocale } from "#/i18n";
import { errorText } from "#/server/errors";
import { sendMail } from "#/server/mailer";
import { CLIENT_IP_HEADER } from "#/server/rate-limit";
import { passwordPolicy } from "./password-policy";
import { checkSetupCode } from "./setup-code";
import { signupPolicy } from "./signup";

const passwords = passwordPolicy();
// Sign-up errors, in the visitor's language: their choice in the page's
// selector (cookie), else their browser's.
const requestLocale = (request?: Request) =>
	resolveVisitorLocale({
		cookie: request?.headers.get("cookie"),
		acceptLanguage: request?.headers.get("accept-language"),
	}).locale;
const baseUrl = (
	process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

/** The MCP endpoint, as the audience of OAuth access tokens. */
export const MCP_RESOURCE = `${baseUrl}/api/mcp`;

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg", schema }),
	// The dashboard's language, set from the user menu (never at sign-up).
	user: {
		additionalFields: {
			locale: { type: "string", required: false, input: false },
			detectedLocale: { type: "string", required: false, input: false },
		},
	},
	disabledPaths: [
		// OAuth clients get tokens from /oauth2/token only, not from the JWT plugin.
		"/token",
		// Invitations are accepted through their signed link only (see
		// lib/signup.ts). The plugin's own endpoints take the invitation id
		// alone, which every member of the organization sees.
		"/organization/accept-invitation",
		"/organization/reject-invitation",
		// The dashboard never deletes an organization, and this endpoint would
		// leave its projects' screenshots in storage (rows cascade, files do
		// not). Projects are deleted one by one, files included.
		"/organization/delete",
	],
	emailAndPassword: {
		enabled: true,
		minPasswordLength: passwords.minLength,
		resetPasswordTokenExpiresIn: 60 * 60,
		revokeSessionsOnPasswordReset: true,
		// Needs SMTP_* in the environment; the login page hides the link otherwise.
		// In the person's language; else the language of the browser asking.
		sendResetPassword: async ({ user, url }, request) => {
			const locale = preferredLocale(
				user as { locale?: string | null; detectedLocale?: string | null },
				requestLocale(request),
			);
			const { emails } = messages(locale);
			await sendMail({
				to: user.email,
				locale,
				subject: emails.passwordReset.subject,
				text: emails.passwordReset.text(user.name),
				action: { label: emails.passwordReset.action, url },
			});
		},
	},
	// Sign-in and sign-up attempts are limited per IP (Better Auth's defaults,
	// on in production). The IP is set by /api/auth from the connection, or
	// from X-Forwarded-For when TRUST_PROXY=true (see withClientIp).
	rateLimit: { enabled: process.env.NODE_ENV === "production" },
	advanced: {
		ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
	},
	// The first account owns the server, so creating it takes the setup code
	// printed in the server logs (see setup-code.ts).
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== "/sign-up/email") return;
			const { firstUser } = await signupPolicy();
			if (firstUser && !checkSetupCode(ctx.body?.setupCode)) {
				throw new APIError("FORBIDDEN", {
					message: errorText(requestLocale(ctx.request), "wrongSetupCode"),
				});
			}
		}),
	},
	databaseHooks: {
		user: {
			create: {
				before: async (newUser, ctx) => {
					// The invitation link's token, sent with the sign-up form.
					const invite: unknown = ctx?.body?.invite;
					const policy = await signupPolicy(
						newUser.email,
						typeof invite === "string" ? invite : undefined,
					);
					if (!policy.allowed) {
						throw new APIError("FORBIDDEN", {
							message: errorText(requestLocale(ctx?.request), "signupClosed"),
						});
					}
				},
			},
		},
	},
	plugins: [
		organization(),
		haveIBeenPwned({
			enabled: passwords.breachCheck,
			customPasswordCompromisedMessage:
				"This password appears in a known data breach. Choose another one.",
		}),
		// MCP over OAuth: an MCP client (Claude Code, Cursor…) registers itself,
		// sends the user to /login then /consent, and gets a token bound to
		// /api/mcp. Agents without a browser keep using API tokens instead.
		jwt({ disableSettingJwtHeader: true }),
		mcp({
			loginPage: "/login",
			consentPage: "/consent",
			resource: MCP_RESOURCE,
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
		}),
		cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
		// Must stay last: forwards Set-Cookie headers from server functions.
		tanstackStartCookies(),
	],
});

export type Session = typeof auth.$Infer.Session;
