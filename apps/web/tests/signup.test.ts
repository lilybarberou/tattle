import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { invitation, member } from "#/db/schema";
import { auth } from "#/lib/auth";
import {
	acceptInvitation,
	readInvitationToken,
	signInvitation,
	signupPolicy,
} from "#/lib/signup";
import { createOrganization, createUser } from "./helpers/factories";
import { setupTestDatabase } from "./helpers/runtime";

setupTestDatabase();

afterEach(() => {
	vi.unstubAllEnvs();
});

/** Invites an email and returns the token of its link. */
const invite = async (
	email: string,
	options: { status?: string; expiresAt?: Date; role?: string } = {},
) => {
	const org = await createOrganization();
	const inviter = await createUser();
	const id = randomUUID();
	await db.insert(invitation).values({
		id,
		organizationId: org.id,
		email,
		role: options.role,
		status: options.status ?? "pending",
		expiresAt: options.expiresAt ?? new Date(Date.now() + 86_400_000),
		inviterId: inviter.id,
	});
	return { token: signInvitation(id), organizationId: org.id, id };
};

describe("invitation tokens", () => {
	it("reads back only what this server signed", () => {
		const token = signInvitation("abc-123");
		expect(readInvitationToken(token)).toBe("abc-123");
		expect(readInvitationToken(`abc-124.${token.split(".")[1]}`)).toBeNull();
		expect(readInvitationToken("abc-123")).toBeNull();
		expect(readInvitationToken("abc-123.forged")).toBeNull();
		expect(readInvitationToken(undefined)).toBeNull();
	});
});

describe("signupPolicy", () => {
	it("lets the very first account in", async () => {
		expect(await signupPolicy("admin@example.com")).toEqual({
			firstUser: true,
			open: false,
			allowed: true,
		});
	});

	it("then only lets invited emails in, with their link's token", async () => {
		await createUser();
		const { token } = await invite("guest@example.com");
		expect((await signupPolicy("stranger@example.com", token)).allowed).toBe(
			false,
		);
		expect((await signupPolicy(" Guest@Example.com ", token)).allowed).toBe(
			true,
		);
		expect((await signupPolicy()).allowed).toBe(false);
	});

	it("never tells whether an email was invited without the token", async () => {
		await createUser();
		const other = await invite("other@example.com");
		await invite("guest@example.com");
		expect((await signupPolicy("guest@example.com")).allowed).toBe(false);
		expect((await signupPolicy("guest@example.com", other.token)).allowed).toBe(
			false,
		);
		expect((await signupPolicy("guest@example.com", "x.forged")).allowed).toBe(
			false,
		);
	});

	it("ignores expired or used invitations", async () => {
		const late = await invite("late@example.com", {
			expiresAt: new Date(Date.now() - 1000),
		});
		const done = await invite("done@example.com", { status: "accepted" });
		expect((await signupPolicy("late@example.com", late.token)).allowed).toBe(
			false,
		);
		expect((await signupPolicy("done@example.com", done.token)).allowed).toBe(
			false,
		);
	});

	it("lets anyone in with ALLOW_SIGNUP=true", async () => {
		await createUser();
		vi.stubEnv("ALLOW_SIGNUP", "true");
		expect(await signupPolicy("anyone@example.com")).toEqual({
			firstUser: false,
			open: true,
			allowed: true,
		});
	});
});

describe("acceptInvitation", () => {
	const membership = (organizationId: string, userId: string) =>
		db
			.select({ role: member.role })
			.from(member)
			.where(
				and(
					eq(member.organizationId, organizationId),
					eq(member.userId, userId),
				),
			);

	it("joins the organization with the invited role", async () => {
		const guest = await createUser({ email: "guest@example.com" });
		const sent = await invite("guest@example.com", { role: "admin" });
		expect(await acceptInvitation(guest.id, guest.email, sent.token)).toBe(
			true,
		);
		expect(await membership(sent.organizationId, guest.id)).toEqual([
			{ role: "admin" },
		]);
		// The link works once.
		expect(await acceptInvitation(guest.id, guest.email, sent.token)).toBe(
			false,
		);
	});

	it("needs the token, and the email it was sent to", async () => {
		const guest = await createUser({ email: "guest@example.com" });
		const intruder = await createUser({ email: "intruder@example.com" });
		const sent = await invite("guest@example.com", { role: "admin" });
		expect(
			await acceptInvitation(guest.id, guest.email, `${sent.id}.forged`),
		).toBe(false);
		expect(
			await acceptInvitation(intruder.id, intruder.email, sent.token),
		).toBe(false);
		expect(await membership(sent.organizationId, guest.id)).toEqual([]);
		expect(await membership(sent.organizationId, intruder.id)).toEqual([]);
	});
});

describe("signing up from an invitation link, through Better Auth", () => {
	const ORIGIN = "http://localhost:3000";
	const post = (path: string, body: unknown, cookie?: string) =>
		auth.handler(
			new Request(`${ORIGIN}/api/auth${path}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: ORIGIN,
					...(cookie ? { cookie } : {}),
				},
				body: JSON.stringify(body),
			}),
		);
	const signUp = (email: string, extra: Record<string, unknown> = {}) =>
		post("/sign-up/email", {
			name: "Guest",
			email,
			password: "a-long-enough-password",
			...extra,
		});

	it("needs the link's token when sign-up is closed", async () => {
		await createUser();
		const sent = await invite("guest@example.com");
		expect((await signUp("guest@example.com")).status).toBe(403);
		expect(
			(await signUp("guest@example.com", { invite: `${sent.id}.forged` }))
				.status,
		).toBe(403);
		expect(
			(await signUp("guest@example.com", { invite: sent.token })).status,
		).toBe(200);
	});

	it("never joins an organization by the invitation id alone", async () => {
		// With open sign-up anyone can create the invited email's account; a
		// member who sees the pending invitation's id must still not be able
		// to take its seat through Better Auth's own endpoint.
		await createUser();
		vi.stubEnv("ALLOW_SIGNUP", "true");
		const sent = await invite("boss@example.com", { role: "admin" });
		const created = await signUp("boss@example.com");
		expect(created.status).toBe(200);
		const cookie = (created.headers.getSetCookie?.() ?? [])
			.map((c) => c.split(";")[0])
			.join("; ");
		const accepted = await post(
			"/organization/accept-invitation",
			{ invitationId: sent.id },
			cookie,
		);
		expect(accepted.status).toBe(404);
		const [joined] = await db
			.select({ id: member.id })
			.from(member)
			.where(eq(member.organizationId, sent.organizationId));
		expect(joined).toBeUndefined();
	});
});
