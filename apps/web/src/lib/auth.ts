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
import { sendMail } from "#/server/mailer";
import { CLIENT_IP_HEADER } from "#/server/rate-limit";
import { passwordPolicy } from "./password-policy";
import { checkSetupCode } from "./setup-code";
import { signupPolicy } from "./signup";

const passwords = passwordPolicy();
const baseUrl = (
	process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

/** The MCP endpoint, as the audience of OAuth access tokens. */
export const MCP_RESOURCE = `${baseUrl}/api/mcp`;

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg", schema }),
	// OAuth clients get tokens from /oauth2/token only, not from the JWT plugin.
	disabledPaths: ["/token"],
	emailAndPassword: {
		enabled: true,
		minPasswordLength: passwords.minLength,
		resetPasswordTokenExpiresIn: 60 * 60,
		revokeSessionsOnPasswordReset: true,
		// Needs SMTP_* in the environment; the login page hides the link otherwise.
		sendResetPassword: async ({ user, url }) => {
			await sendMail({
				to: user.email,
				subject: "Reset your Tattle password",
				text: `Hi ${user.name},\n\nSomeone asked to reset the password of your Tattle account. If it was you, choose a new password with the button below. The link works for one hour.\n\nIf it wasn't you, ignore this email: your password stays the same.`,
				action: { label: "Choose a new password", url },
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
					message:
						"Wrong setup code. It is in the server logs, on the line that starts with [setup].",
				});
			}
		}),
	},
	databaseHooks: {
		user: {
			create: {
				before: async (newUser) => {
					const policy = await signupPolicy(newUser.email);
					if (!policy.allowed) {
						throw new APIError("FORBIDDEN", {
							message:
								"Sign-up is closed on this server. Ask a member to invite your email address.",
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
