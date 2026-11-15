import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "#/db";
import { invitation, member, organization } from "#/db/schema";
import { createOrganization } from "./helpers/factories";
import { setupTestDatabase } from "./helpers/runtime";
import { authRequest, signedInMember } from "./helpers/session";

setupTestDatabase();

// Better Auth's organization plugin serves its own endpoints next to the
// app's server functions. Whatever the app does not use must stay within
// the roles the app shows: a member must not manage, an admin must not own.

const memberRole = async (organizationId: string, userId: string) => {
	const rows = await db.select().from(member).where(eq(member.userId, userId));
	return rows.find((r) => r.organizationId === organizationId)?.role ?? null;
};

/** A refusal from Better Auth: a 4xx, whichever one it picks. */
const expectRefused = async (response: Response) => {
	expect(response.status, await response.clone().text()).toBeGreaterThanOrEqual(
		400,
	);
	expect(response.status).toBeLessThan(500);
};

const workspace = async () => {
	const org = await createOrganization("Acme");
	const owner = await signedInMember(org.id, "owner");
	const admin = await signedInMember(org.id, "admin");
	const plain = await signedInMember(org.id, "member");
	const memberId = async (userId: string) =>
		(await db.select().from(member).where(eq(member.userId, userId)))[0]
			?.id as string;
	return { org, owner, admin, plain, memberId };
};

describe("Better Auth's organization endpoints", () => {
	it("let a signed-in person create their first organization (onboarding)", async () => {
		const other = await createOrganization();
		const person = await signedInMember(other.id, "member");
		const created = await authRequest(
			"/organization/create",
			{ name: "Mine", slug: "mine-org" },
			person.cookie,
		);
		expect(created.status).toBe(200);
		const [row] = await db
			.select()
			.from(organization)
			.where(eq(organization.slug, "mine-org"));
		expect(row).toBeDefined();
		expect(await memberRole(row?.id as string, person.userId)).toBe("owner");
	});

	it("refuse anonymous calls", async () => {
		const { org } = await workspace();
		const response = await authRequest("/organization/update", {
			organizationId: org.id,
			data: { name: "Hijacked" },
		});
		expect(response.status).toBe(401);
	});

	it("never let a member rename or delete the organization", async () => {
		const { org, plain } = await workspace();
		const renamed = await authRequest(
			"/organization/update",
			{ organizationId: org.id, data: { name: "Hijacked" } },
			plain.cookie,
		);
		await expectRefused(renamed);
		const deleted = await authRequest(
			"/organization/delete",
			{ organizationId: org.id },
			plain.cookie,
		);
		await expectRefused(deleted);
		const [row] = await db
			.select()
			.from(organization)
			.where(eq(organization.id, org.id));
		expect(row?.name).toBe("Acme");
	});

	it("never let a member invite, remove someone or change a role", async () => {
		const { org, plain, admin, memberId } = await workspace();
		const invited = await authRequest(
			"/organization/invite-member",
			{ organizationId: org.id, email: "friend@example.com", role: "admin" },
			plain.cookie,
		);
		await expectRefused(invited);
		expect(await db.select().from(invitation)).toEqual([]);

		const removed = await authRequest(
			"/organization/remove-member",
			{ organizationId: org.id, memberIdOrEmail: admin.email },
			plain.cookie,
		);
		await expectRefused(removed);

		const promoted = await authRequest(
			"/organization/update-member-role",
			{
				organizationId: org.id,
				memberId: await memberId(plain.userId),
				role: "owner",
			},
			plain.cookie,
		);
		await expectRefused(promoted);
		expect(await memberRole(org.id, plain.userId)).toBe("member");
		expect(await memberRole(org.id, admin.userId)).toBe("admin");
	});

	it("never let an admin make themselves owner or remove the owner", async () => {
		const { org, owner, admin, memberId } = await workspace();
		const promoted = await authRequest(
			"/organization/update-member-role",
			{
				organizationId: org.id,
				memberId: await memberId(admin.userId),
				role: "owner",
			},
			admin.cookie,
		);
		await expectRefused(promoted);
		expect(await memberRole(org.id, admin.userId)).toBe("admin");

		const removed = await authRequest(
			"/organization/remove-member",
			{ organizationId: org.id, memberIdOrEmail: owner.email },
			admin.cookie,
		);
		await expectRefused(removed);
		expect(await memberRole(org.id, owner.userId)).toBe("owner");
	});

	it("never delete an organization, not even for its owner", async () => {
		// Its projects' screenshots would stay in storage: projects are
		// deleted one by one from the dashboard, files included.
		const { org, owner, admin } = await workspace();
		for (const person of [admin, owner]) {
			const response = await authRequest(
				"/organization/delete",
				{ organizationId: org.id },
				person.cookie,
			);
			expect(response.status).toBe(404);
		}
		expect(
			await db.select().from(organization).where(eq(organization.id, org.id)),
		).toHaveLength(1);
	});

	it("never let anyone act on an organization they are not in", async () => {
		const { org } = await workspace();
		const elsewhere = await createOrganization();
		const stranger = await signedInMember(elsewhere.id, "owner");
		for (const [path, body] of [
			["/organization/update", { organizationId: org.id, data: { name: "X" } }],
			["/organization/delete", { organizationId: org.id }],
			[
				"/organization/invite-member",
				{ organizationId: org.id, email: "x@example.com", role: "member" },
			],
		] as const) {
			const response = await authRequest(path, body, stranger.cookie);
			expect(response.status, path).toBeGreaterThanOrEqual(400);
			expect(response.status, path).toBeLessThan(500);
		}
		const [row] = await db
			.select()
			.from(organization)
			.where(eq(organization.id, org.id));
		expect(row?.name).toBe("Acme");
	});
});
