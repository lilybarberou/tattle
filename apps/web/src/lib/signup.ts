import { and, count, eq, gt } from "drizzle-orm";
import { db } from "#/db";
import { invitation, member, user } from "#/db/schema";
import { setupCodeLogLine } from "./setup-code";

/**
 * Who may create an account on this server:
 * - the very first account (the admin), always;
 * - anyone, when ALLOW_SIGNUP=true;
 * - otherwise only an email that has a pending invitation.
 */
export async function signupPolicy(email?: string) {
	const [users] = await db.select({ value: count() }).from(user);
	const firstUser = (users?.value ?? 0) === 0;
	const open = process.env.ALLOW_SIGNUP === "true";
	let invited = false;
	if (email && !firstUser && !open) {
		const [pending] = await db
			.select({ id: invitation.id })
			.from(invitation)
			.where(
				and(
					eq(invitation.email, email.trim().toLowerCase()),
					eq(invitation.status, "pending"),
					gt(invitation.expiresAt, new Date()),
				),
			)
			.limit(1);
		invited = Boolean(pending);
	}
	return { firstUser, open, allowed: firstUser || open || invited };
}

/** Turns the pending invitations of a signed-in user into memberships. */
export async function acceptPendingInvitations(userId: string, email: string) {
	const pending = await db
		.select()
		.from(invitation)
		.where(
			and(
				eq(invitation.email, email.trim().toLowerCase()),
				eq(invitation.status, "pending"),
				gt(invitation.expiresAt, new Date()),
			),
		);
	for (const invite of pending) {
		await db.transaction(async (tx) => {
			const [existing] = await tx
				.select({ id: member.id })
				.from(member)
				.where(
					and(
						eq(member.organizationId, invite.organizationId),
						eq(member.userId, userId),
					),
				);
			if (!existing) {
				await tx.insert(member).values({
					id: crypto.randomUUID(),
					organizationId: invite.organizationId,
					userId,
					role: invite.role ?? "member",
					createdAt: new Date(),
				});
			}
			await tx
				.update(invitation)
				.set({ status: "accepted" })
				.where(eq(invitation.id, invite.id));
		});
	}
	return pending.length;
}

let announced = false;
/** Prints the setup code once per process, when the login page first asks. */
export function announceSetupCode() {
	if (announced) return;
	announced = true;
	console.info(setupCodeLogLine(process.env.BETTER_AUTH_URL ?? ""));
}
