import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { invitation, issue } from "#/db/schema";
import * as fns from "#/server/fns";
import {
	createApiToken,
	createOrganization,
	createWorkspace,
} from "./helpers/factories";
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

describe("assignees", () => {
	it("must belong to the project's organization", async () => {
		const { org, project: p } = await createWorkspace();
		const other = await createOrganization();
		const outsider = await signedInMember(other.id, "member");
		const { row: theirAgent } = await createApiToken(other.id);
		const { row: revoked } = await createApiToken(org.id, { revoked: true });
		const me = await signedInMember(org.id, "member", { name: "Me" });
		as(me);
		const created = await fns.createIssueFn({
			data: { projectId: p.id, type: "bug", title: "Broken" },
		});

		const assign = (assignee: { type: "user" | "agent"; id: string }) =>
			fns.updateIssueFn({
				data: { projectId: p.id, number: created.number, assignee },
			});
		await expect(
			assign({ type: "user", id: outsider.userId }),
		).rejects.toMatchObject({ status: 400, message: "Unknown member" });
		await expect(
			assign({ type: "agent", id: theirAgent.id }),
		).rejects.toMatchObject({ status: 400, message: "Unknown agent" });
		await expect(
			assign({ type: "agent", id: revoked.id }),
		).rejects.toMatchObject({ status: 400, message: "Unknown agent" });

		// The name always comes from the database.
		const assigned = await fns.updateIssueFn({
			data: {
				projectId: p.id,
				number: created.number,
				assignee: { type: "user", id: me.userId },
			},
		});
		expect(assigned).toMatchObject({
			assignee: { type: "user", id: me.userId, name: "Me" },
		});
	});

	it("leave no issue behind when the assignee of a new issue is unknown", async () => {
		const { project: p, org } = await createWorkspace();
		as(await signedInMember(org.id));
		await expect(
			fns.createIssueFn({
				data: {
					projectId: p.id,
					type: "bug",
					title: "Broken",
					assignee: { type: "user", id: randomUUID() },
				},
			}),
		).rejects.toMatchObject({ status: 400 });
		expect(await db.select().from(issue)).toEqual([]);
	});

	it("are the members and the write agents of the organization", async () => {
		const { project: p, org } = await createWorkspace();
		await createApiToken(org.id, { name: "Writer", canWrite: true });
		await createApiToken(org.id, { name: "Reader", canWrite: false });
		await createApiToken(org.id, { name: "Gone", revoked: true });
		const me = await signedInMember(org.id, "member", { name: "Me" });
		as(me);
		const listed = await fns.listAssigneesFn({ data: { projectId: p.id } });
		expect(listed.me).toBe(me.userId);
		expect(listed.members.map((m) => m.name)).toEqual(["Me"]);
		expect(listed.agents.map((a) => a.name)).toEqual(["Writer"]);
	});
});
