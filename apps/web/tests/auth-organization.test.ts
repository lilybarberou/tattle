import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "#/db";
import { member, organization } from "#/db/schema";
import { createOrganization } from "./helpers/factories";
import { setupTestDatabase } from "./helpers/runtime";
import { authRequest, signedInMember } from "./helpers/session";

setupTestDatabase();

// Better Auth's organization plugin serves its own endpoints next to the
// app's server functions. Whatever the app does not use must stay within
// the roles the app shows: a member must not manage, an admin must not own.

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
});
