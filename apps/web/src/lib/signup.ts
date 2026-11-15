import { createHmac, timingSafeEqual } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "#/db";
import { invitation, member, user } from "#/db/schema";
import { env } from "#/server/env";
import { setupCodeLogLine } from "./setup-code";

// An invitation link carries a token signed by the server: knowing the
// invited email is not enough to create that account or take that seat.
// The key is derived from the server secret for this purpose only.
const invitationSignature = (id: string) =>
	createHmac(
		"sha256",
		createHmac("sha256", env.secret).update("tattle:invitation").digest(),
	)
		.update(id)
		.digest("base64url");

/** The token of an invitation link. */
export const signInvitation = (id: string) =>
	`${id}.${invitationSignature(id)}`;

/** The invitation id in a token, or null when this server did not sign it. */
export const readInvitationToken = (token: string | undefined | null) => {
	if (!token) return null;
	const dot = token.lastIndexOf(".");
	if (dot <= 0) return null;
	const id = token.slice(0, dot);
	const expected = Buffer.from(invitationSignature(id));
	const actual = Buffer.from(token.slice(dot + 1));
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
		return null;
	return id;
};

/** The pending invitation behind a token, when it was sent to this email. */
async function findInvitation(token: string | undefined, email: string) {
	const id = readInvitationToken(token);
	if (!id) return null;
	const [pending] = await db
		.select()
		.from(invitation)
		.where(
			and(
				eq(invitation.id, id),
				eq(invitation.email, email.trim().toLowerCase()),
				eq(invitation.status, "pending"),
				gt(invitation.expiresAt, new Date()),
			),
		)
		.limit(1);
	return pending ?? null;
}

/**
 * Who may create an account on this server:
 * - the very first account (the admin), always;
 * - anyone, when ALLOW_SIGNUP=true;
 * - otherwise only the email of a pending invitation, with the token of its
 *   link: an arbitrary email never tells whether it was invited.
 */
export async function signupPolicy(email?: string, invite?: string) {
	const [users] = await db.select({ value: count() }).from(user);
	const firstUser = (users?.value ?? 0) === 0;
	const open = process.env.ALLOW_SIGNUP === "true";
	let invited = false;
	if (email && invite && !firstUser && !open) {
		invited = Boolean(await findInvitation(invite, email));
	}
	return { firstUser, open, allowed: firstUser || open || invited };
}

/**
 * Turns the invitation of a link into a membership, for the signed-in person
 * it was sent to. Returns whether they joined.
 */
export async function acceptInvitation(
	userId: string,
	email: string,
	invite: string,
) {
	const pending = await findInvitation(invite, email);
	if (!pending) return false;
	await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: member.id })
			.from(member)
			.where(
				and(
					eq(member.organizationId, pending.organizationId),
					eq(member.userId, userId),
				),
			);
		if (!existing) {
			await tx.insert(member).values({
				id: crypto.randomUUID(),
				organizationId: pending.organizationId,
				userId,
				role: pending.role ?? "member",
				createdAt: new Date(),
			});
		}
		await tx
			.update(invitation)
			.set({ status: "accepted" })
			.where(eq(invitation.id, pending.id));
	});
	return true;
}

let announced = false;
/** Prints the setup code once per process, when the login page first asks. */
export function announceSetupCode() {
	if (announced) return;
	announced = true;
	console.info(setupCodeLogLine(process.env.BETTER_AUTH_URL ?? ""));
}
