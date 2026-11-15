import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { invitation } from "#/db/schema";
import * as fns from "#/server/fns";
import { createOrganization } from "./helpers/factories";
import { resetRequestContext, signInWith } from "./helpers/request-context";
import { setupTestDatabase } from "./helpers/runtime";
import { type SignedIn, signedInMember } from "./helpers/session";

vi.mock("@tanstack/react-start", () => import("./helpers/start-mock"));
vi.mock("@tanstack/react-start/server", () => import("./helpers/start-mock"));

setupTestDatabase();
beforeEach(() => resetRequestContext());

const as = (person: SignedIn) => signInWith(person.cookie);

describe("inviting people", () => {
	it("trims a pasted address before checking it", async () => {
		const org = await createOrganization();
		as(await signedInMember(org.id, "owner"));
		await fns.inviteMemberFn({
			data: {
				organizationId: org.id,
				email: "  Camille@Example.com ",
				role: "member",
			},
		});
		const [row] = await db.select().from(invitation);
		expect(row?.email).toBe("camille@example.com");
	});

	it("shows an admin the link of an invitation still waiting, the same one", async () => {
		const org = await createOrganization();
		const other = await createOrganization();
		const admin = await signedInMember(org.id, "admin");
		const plain = await signedInMember(org.id, "member");
		as(admin);
		const sent = await fns.inviteMemberFn({
			data: {
				organizationId: org.id,
				email: "late@example.com",
				role: "member",
			},
		});
		const [row] = await db.select().from(invitation);
		const invitationId = row?.id as string;
		const ask = (organizationId: string) =>
			fns.getInvitationLinkFn({ data: { organizationId, invitationId } });

		expect(await ask(org.id)).toEqual({
			email: "late@example.com",
			link: sent.link,
		});
		// Not through another organization, and not for plain members.
		await expect(ask(other.id)).rejects.toMatchObject({ status: 403 });
		as(plain);
		await expect(ask(org.id)).rejects.toMatchObject({ status: 403 });

		as(admin);
		await db
			.update(invitation)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(invitation.id, invitationId));
		await expect(ask(org.id)).rejects.toMatchObject({ status: 404 });
		await db
			.update(invitation)
			.set({ expiresAt: new Date(Date.now() + 3_600_000), status: "canceled" })
			.where(eq(invitation.id, invitationId));
		await expect(ask(org.id)).rejects.toMatchObject({ status: 404 });
	});
});
