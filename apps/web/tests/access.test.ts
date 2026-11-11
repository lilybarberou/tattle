import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "#/db";
import { apiToken, oauthClient, oauthConsent } from "#/db/schema";
import { Access, actorOf, type Principal } from "#/server/Access";
import {
	addMember,
	createApiToken,
	createOrganization,
	createProject,
	createUser,
	createWorkspace,
} from "./helpers/factories";
import { run, runFailure, setupTestDatabase } from "./helpers/runtime";

setupTestDatabase();

const fromToken = (token: string) =>
	Access.use((access) => access.fromToken(token));

describe("API tokens", () => {
	it("resolve to a token principal of their organization", async () => {
		const org = await createOrganization();
		const { token, row } = await createApiToken(org.id, { name: "Triage bot" });

		const principal = await run(fromToken(token));
		expect(principal).toEqual({
			kind: "token",
			tokenId: row.id,
			name: "Triage bot",
			organizationIds: [org.id],
			canWrite: true,
		});
		expect(actorOf(principal)).toEqual({
			type: "agent",
			id: row.id,
			name: "Triage bot",
		});

		const [after] = await db
			.select()
			.from(apiToken)
			.where(eq(apiToken.id, row.id));
		expect(after?.lastUsedAt).toBeInstanceOf(Date);
	});

	it("are also read from the Authorization header", async () => {
		const org = await createOrganization();
		const { token } = await createApiToken(org.id);
		const principal = await run(
			Access.use((access) =>
				access.fromHeaders(new Headers({ authorization: `Bearer ${token}` })),
			),
		);
		expect(principal.kind).toBe("token");
	});

	it("are rejected once revoked", async () => {
		const org = await createOrganization();
		const { token } = await createApiToken(org.id, { revoked: true });
		expect((await runFailure(fromToken(token)))._tag).toBe("Unauthorized");
	});

	it("are rejected when unknown", async () => {
		expect((await runFailure(fromToken("tat_not-a-real-token")))._tag).toBe(
			"Unauthorized",
		);
	});

	it("can be read-only: requireWrite refuses them", async () => {
		const org = await createOrganization();
		const readOnly = await run(
			fromToken((await createApiToken(org.id, { canWrite: false })).token),
		);
		const writer = await run(fromToken((await createApiToken(org.id)).token));

		const error = await runFailure(
			Access.use((access) => access.requireWrite(readOnly)),
		);
		expect(error._tag).toBe("Forbidden");
		await expect(
			run(Access.use((access) => access.requireWrite(writer))),
		).resolves.toBeUndefined();
	});
});

describe("requireProject", () => {
	it("gives access to the projects of the principal's organizations only", async () => {
		const { org, project: mine } = await createWorkspace();
		const { project: theirs } = await createWorkspace();
		const principal = await run(
			fromToken((await createApiToken(org.id)).token),
		);

		const found = await run(
			Access.use((access) => access.requireProject(principal, mine.id)),
		);
		expect(found.id).toBe(mine.id);
		const error = await runFailure(
			Access.use((access) => access.requireProject(principal, theirs.id)),
		);
		expect(error._tag).toBe("NotFound");
	});

	it("gives nothing to a user without organizations", async () => {
		const { project: p } = await createWorkspace();
		const loner = await createUser();
		const principal = await run(
			Access.use((access) => access.fromUserId(loner.id)),
		);
		expect(principal.organizationIds).toEqual([]);
		const error = await runFailure(
			Access.use((access) => access.requireProject(principal, p.id)),
		);
		expect(error._tag).toBe("NotFound");
	});
});

describe("requireOrganization", () => {
	it("checks membership", async () => {
		const org = await createOrganization();
		const other = await createOrganization();
		const principal: Principal = {
			kind: "user",
			userId: "u",
			name: "Ada",
			organizationIds: [org.id],
		};
		await expect(
			run(
				Access.use((access) => access.requireOrganization(principal, org.id)),
			),
		).resolves.toBeUndefined();
		const error = await runFailure(
			Access.use((access) => access.requireOrganization(principal, other.id)),
		);
		expect(error._tag).toBe("Forbidden");
	});
});

describe("users", () => {
	it("fromUserId lists the user's organizations", async () => {
		const org = await createOrganization();
		await createProject(org.id);
		const person = await createUser({ name: "Grace" });
		await addMember(org.id, person.id);
		const principal = await run(
			Access.use((access) => access.fromUserId(person.id)),
		);
		expect(principal).toEqual({
			kind: "user",
			userId: person.id,
			name: "Grace",
			organizationIds: [org.id],
		});
	});

	it("fromUserId rejects an unknown user", async () => {
		const error = await runFailure(
			Access.use((access) => access.fromUserId("nobody")),
		);
		expect(error._tag).toBe("Unauthorized");
	});

	it("fromHeaders without a token or session is Unauthorized", async () => {
		const error = await runFailure(
			Access.use((access) => access.fromHeaders(new Headers())),
		);
		expect(error._tag).toBe("Unauthorized");
	});
});

describe("fromOAuth", () => {
	const setup = async (options: { consent: boolean; disabled?: boolean }) => {
		const org = await createOrganization();
		const person = await createUser();
		await addMember(org.id, person.id);
		const clientId = `client-${randomUUID()}`;
		await db.insert(oauthClient).values({
			id: randomUUID(),
			clientId,
			name: "Claude Code",
			redirectUris: ["http://localhost:1234/callback"],
			disabled: options.disabled ?? false,
		});
		if (options.consent) {
			await db.insert(oauthConsent).values({
				id: randomUUID(),
				clientId,
				userId: person.id,
				scopes: ["openid"],
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}
		return { org, person, clientId };
	};
	const fromOAuth = (userId: string, clientId: string) =>
		Access.use((access) => access.fromOAuth(userId, clientId));

	it("resolves the user while they still allow the app", async () => {
		const { org, person, clientId } = await setup({ consent: true });
		expect(await run(fromOAuth(person.id, clientId))).toMatchObject({
			kind: "user",
			userId: person.id,
			organizationIds: [org.id],
		});
	});

	it("rejects when there is no consent", async () => {
		const { person, clientId } = await setup({ consent: false });
		const error = await runFailure(fromOAuth(person.id, clientId));
		expect(error).toMatchObject({
			_tag: "Unauthorized",
			message: "This app was disconnected",
		});
	});

	it("rejects a disabled client", async () => {
		const { person, clientId } = await setup({ consent: true, disabled: true });
		expect((await runFailure(fromOAuth(person.id, clientId)))._tag).toBe(
			"Unauthorized",
		);
	});
});
