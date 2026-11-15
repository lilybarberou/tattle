import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import {
	invitation,
	issue,
	issueVote,
	member,
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	report,
} from "#/db/schema";
import { readInvitationToken } from "#/lib/signup";
import { signThreadLink } from "#/server/Conversations";
import * as fns from "#/server/fns";
import { Ingest } from "#/server/Ingest";
import { captureMail, stopCapturingMail } from "#/server/mailer";
import { HttpError } from "#/server/runtime";
import { signUnsubscribe } from "#/server/unsubscribe";
import {
	createApiToken,
	createOrganization,
	createWorkspace,
	reportPayload,
} from "./helpers/factories";
import {
	requestContext,
	resetRequestContext,
	signInWith,
	signOut,
} from "./helpers/request-context";
import { run, setupTestDatabase } from "./helpers/runtime";
import { type SignedIn, signedInMember, signUp } from "./helpers/session";

vi.mock("@tanstack/react-start", () => import("./helpers/start-mock"));
vi.mock("@tanstack/react-start/server", () => import("./helpers/start-mock"));

setupTestDatabase();
beforeEach(() => resetRequestContext());
afterEach(() => {
	stopCapturingMail();
	vi.unstubAllEnvs();
});

const as = (person: SignedIn) => signInWith(person.cookie);

const statusOf = async (call: Promise<unknown>) => {
	try {
		await call;
		return 200;
	} catch (error) {
		if (error instanceof HttpError) return error.status;
		throw error;
	}
};

describe("inviting people", () => {
	it("sends a signed link to the lowercased email, valid 7 days", async () => {
		const outbox = captureMail();
		const org = await createOrganization("Atelier Nord");
		const admin = await signedInMember(org.id, "admin", { name: "Ada" });
		as(admin);
		const before = Date.now();
		const sent = await fns.inviteMemberFn({
			data: {
				organizationId: org.id,
				email: "Guest@Example.COM",
				role: "admin",
			},
		});
		expect(sent.emailed).toBe(true);
		const url = new URL(sent.link);
		expect(url.origin + url.pathname).toBe("http://localhost:3000/login");
		expect(url.searchParams.get("email")).toBe("guest@example.com");
		const [row] = await db.select().from(invitation);
		expect(readInvitationToken(url.searchParams.get("invite"))).toBe(row?.id);
		expect(row).toMatchObject({
			email: "guest@example.com",
			role: "admin",
			status: "pending",
			inviterId: admin.userId,
		});
		const days =
			((row?.expiresAt.getTime() ?? 0) - before) / (24 * 3600 * 1000);
		expect(days).toBeGreaterThan(6.99);
		expect(days).toBeLessThan(7.01);

		expect(outbox).toHaveLength(1);
		expect(outbox[0]).toMatchObject({
			to: "guest@example.com",
			subject: "Ada invited you to Atelier Nord on Tattle",
			action: { url: sent.link },
		});
	});

	it("still gives the link when no email can be sent", async () => {
		const org = await createOrganization();
		as(await signedInMember(org.id, "owner"));
		const sent = await fns.inviteMemberFn({
			data: { organizationId: org.id, email: "a@example.com", role: "member" },
		});
		expect(sent.emailed).toBe(false);
		expect(sent.link).toContain("invite=");
	});

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

	it("refuses an address that is not an email", async () => {
		const org = await createOrganization();
		as(await signedInMember(org.id, "owner"));
		await expect(
			fns.inviteMemberFn({
				data: {
					organizationId: org.id,
					email: "a@example.com, b@example.com",
					role: "member",
				},
			}),
		).rejects.toThrow();
		expect(await db.select().from(invitation)).toEqual([]);
	});

	it("lets the invited person join once signed in with that email", async () => {
		const org = await createOrganization();
		as(await signedInMember(org.id, "owner"));
		const guest = await signUp({ email: "guest@example.com" });
		const intruder = await signUp({ email: "intruder@example.com" });
		const sent = await fns.inviteMemberFn({
			data: {
				organizationId: org.id,
				email: "guest@example.com",
				role: "member",
			},
		});
		const invite = new URL(sent.link).searchParams.get("invite") as string;

		signOut();
		expect(await fns.acceptInvitationFn({ data: { invite } })).toEqual({
			joined: false,
		});
		as(intruder);
		expect(await fns.acceptInvitationFn({ data: { invite } })).toEqual({
			joined: false,
		});
		as(guest);
		expect(
			await fns.acceptInvitationFn({ data: { invite: `${invite}x` } }),
		).toEqual({ joined: false });
		expect(await fns.acceptInvitationFn({ data: { invite } })).toEqual({
			joined: true,
		});
		// The link works once.
		expect(await fns.acceptInvitationFn({ data: { invite } })).toEqual({
			joined: false,
		});
		const members = await db
			.select()
			.from(member)
			.where(eq(member.organizationId, org.id));
		expect(members.map((m) => m.userId)).toContain(guest.userId);
		expect(members.map((m) => m.userId)).not.toContain(intruder.userId);
	});

	it("lists pending invitations, and who can manage them", async () => {
		const org = await createOrganization();
		const owner = await signedInMember(org.id, "owner");
		const plain = await signedInMember(org.id, "member");
		as(owner);
		await fns.inviteMemberFn({
			data: { organizationId: org.id, email: "a@example.com", role: "member" },
		});
		const second = await fns.inviteMemberFn({
			data: { organizationId: org.id, email: "b@example.com", role: "admin" },
		});
		const secondId = readInvitationToken(
			new URL(second.link).searchParams.get("invite"),
		) as string;
		await fns.revokeInvitationFn({
			data: { organizationId: org.id, invitationId: secondId },
		});

		const forOwner = await fns.listMembersFn({
			data: { organizationId: org.id },
		});
		expect(forOwner.canManage).toBe(true);
		expect(forOwner.invitations.map((i) => i.email)).toEqual(["a@example.com"]);
		expect(forOwner.members.map((m) => m.role).sort()).toEqual([
			"member",
			"owner",
		]);

		as(plain);
		const forMember = await fns.listMembersFn({
			data: { organizationId: org.id },
		});
		expect(forMember.canManage).toBe(false);
	});

	it("tells the login page who may sign up", async () => {
		const empty = await fns.getSignupStateFn({ data: {} });
		expect(empty).toMatchObject({ firstUser: true, allowed: true });

		const org = await createOrganization();
		as(await signedInMember(org.id, "owner"));
		const sent = await fns.inviteMemberFn({
			data: {
				organizationId: org.id,
				email: "guest@example.com",
				role: "member",
			},
		});
		const invite = new URL(sent.link).searchParams.get("invite") as string;
		signOut();
		expect(
			await fns.getSignupStateFn({ data: { email: "guest@example.com" } }),
		).toMatchObject({ firstUser: false, open: false, allowed: false });
		expect(
			await fns.getSignupStateFn({
				data: { email: "other@example.com", invite },
			}),
		).toMatchObject({ allowed: false });
		expect(
			await fns.getSignupStateFn({
				data: { email: "GUEST@example.com", invite },
			}),
		).toMatchObject({ allowed: true, canResetPassword: false });
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

describe("searching issues to link", () => {
	it("finds by number or words, without the issue itself or duplicates", async () => {
		const { project: p, org } = await createWorkspace();
		as(await signedInMember(org.id));
		const create = (title: string) =>
			fns.createIssueFn({ data: { projectId: p.id, type: "bug", title } });
		await create("Checkout button broken");
		await create("Checkout page slow");
		await create("Checkout copy");
		await fns.markDuplicateFn({
			data: { projectId: p.id, number: 3, duplicateOf: 1 },
		});

		const search = (query: string, exclude?: number) =>
			fns.searchIssuesFn({ data: { projectId: p.id, query, exclude } });
		expect((await search("#2")).map((i) => i.number)).toEqual([2]);
		expect((await search("2")).map((i) => i.number)).toEqual([2]);
		expect(await search("#99")).toEqual([]);
		expect(await search("#3")).toEqual([]);
		expect((await search("checkout", 1)).map((i) => i.number)).toEqual([2]);
	});
});

describe("the public portal", () => {
	const portal = async () => {
		const { project: p, org } = await createWorkspace({
			portalEnabled: true,
			portalSlug: "acme-ideas",
		});
		const owner = await signedInMember(org.id);
		as(owner);
		await fns.createIssueFn({
			data: {
				projectId: p.id,
				type: "feature",
				title: "Dark mode",
				status: "todo",
			},
		});
		signOut();
		return p;
	};

	it("gives a voter a random cookie and counts their vote once", async () => {
		await portal();
		const first = await fns.portalVoteFn({
			data: { slug: "acme-ideas", number: 1 },
		});
		expect(first).toEqual({ voted: true, demand: 1 });
		expect(requestContext.setCookies).toHaveLength(1);
		const [cookie] = requestContext.setCookies;
		expect(cookie?.name).toBe("tattle_voter");
		expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{24}$/);
		expect(cookie?.options).toMatchObject({
			httpOnly: true,
			sameSite: "lax",
			secure: false,
		});

		// The same cookie takes the vote back; no new cookie is set.
		expect(
			await fns.portalVoteFn({ data: { slug: "acme-ideas", number: 1 } }),
		).toEqual({ voted: false, demand: 0 });
		expect(requestContext.setCookies).toHaveLength(1);
	});

	it("replaces a cookie that is not one of its keys", async () => {
		await portal();
		requestContext.cookies.set("tattle_voter", "short");
		await fns.portalVoteFn({ data: { slug: "acme-ideas", number: 1 } });
		const [vote] = await db.select().from(issueVote);
		expect(vote?.voterKey).not.toBe("short");
		expect(requestContext.setCookies).toHaveLength(1);
	});

	it("asks for a vote before an email", async () => {
		await portal();
		await expect(
			fns.portalNotifyFn({
				data: { slug: "acme-ideas", number: 1, email: "me@example.com" },
			}),
		).rejects.toMatchObject({ status: 400, message: "Vote first" });
		await fns.portalVoteFn({ data: { slug: "acme-ideas", number: 1 } });
		await fns.portalNotifyFn({
			data: { slug: "acme-ideas", number: 1, email: "me@example.com" },
		});
		const [vote] = await db.select().from(issueVote);
		expect(vote?.email).toBe("me@example.com");
	});

	it("takes suggestions to Triage, with bounded text", async () => {
		await portal();
		const suggested = await fns.portalSuggestFn({
			data: { slug: "acme-ideas", title: "  Export to CSV  ", email: "" },
		});
		const [row] = await db
			.select()
			.from(issue)
			.where(eq(issue.number, suggested.number));
		expect(row).toMatchObject({ title: "Export to CSV", status: "triage" });
		for (const title of ["abc", "a".repeat(141)]) {
			await expect(
				fns.portalSuggestFn({ data: { slug: "acme-ideas", title } }),
			).rejects.toThrow();
		}
		await expect(
			fns.portalSuggestFn({
				data: {
					slug: "acme-ideas",
					title: "Long one",
					description: "a".repeat(4001),
				},
			}),
		).rejects.toThrow();
	});

	it("limits each IP to 30 actions per 10 minutes", async () => {
		await portal();
		for (let i = 0; i < 30; i++) {
			await fns.portalVoteFn({ data: { slug: "acme-ideas", number: 1 } });
		}
		await expect(
			fns.portalVoteFn({ data: { slug: "acme-ideas", number: 1 } }),
		).rejects.toMatchObject({
			status: 400,
			message: "Too many actions. Try again in a few minutes.",
		});
		// Another visitor is not affected.
		resetRequestContext();
		expect(
			await fns.portalVoteFn({ data: { slug: "acme-ideas", number: 1 } }),
		).toMatchObject({ voted: true });
	});

	it("does not trust X-Forwarded-For without TRUST_PROXY", async () => {
		await portal();
		const ip = requestContext.ip;
		for (let i = 0; i < 30; i++) {
			requestContext.headers = new Headers({
				"x-forwarded-for": `198.51.100.${i}`,
			});
			await fns.portalVoteFn({ data: { slug: "acme-ideas", number: 1 } });
		}
		requestContext.headers = new Headers({
			"x-forwarded-for": "198.51.100.99",
		});
		expect(requestContext.ip).toBe(ip);
		expect(
			await statusOf(
				fns.portalVoteFn({ data: { slug: "acme-ideas", number: 1 } }),
			),
		).toBe(400);
	});

	it("reads the client from the proxy's end of X-Forwarded-For with TRUST_PROXY", async () => {
		await portal();
		vi.stubEnv("TRUST_PROXY", "true");
		// The client writes the first entries; the proxy appends the real one.
		for (let i = 0; i < 30; i++) {
			requestContext.headers = new Headers({
				"x-forwarded-for": `10.0.0.${i}, 192.0.2.50`,
			});
			await fns.portalVoteFn({ data: { slug: "acme-ideas", number: 1 } });
		}
		requestContext.headers = new Headers({
			"x-forwarded-for": "10.0.0.200, 192.0.2.50",
		});
		expect(
			await statusOf(
				fns.portalVoteFn({ data: { slug: "acme-ideas", number: 1 } }),
			),
		).toBe(400);
		requestContext.headers = new Headers({
			"x-forwarded-for": "192.0.2.51",
		});
		expect(
			await statusOf(
				fns.portalVoteFn({ data: { slug: "acme-ideas", number: 1 } }),
			),
		).toBe(200);
	});

	it("is NotFound when the portal is off", async () => {
		await createWorkspace({ portalEnabled: false, portalSlug: "closed" });
		expect(await statusOf(fns.getPortalFn({ data: { slug: "closed" } }))).toBe(
			404,
		);
	});
});

describe("a reporter's conversation link", () => {
	const sendReport = async () => {
		const { project: p, org } = await createWorkspace();
		const created = await run(
			Ingest.use((ingest) =>
				ingest.submit(
					reportPayload(p.publicKey, {
						reporter: { email: "reporter@example.com" },
					}),
					null,
				),
			),
		);
		const [row] = await db.select().from(report);
		return { p, org, created, reportId: row?.id as string };
	};

	it("opens the thread, takes a reply and refuses a forged token", async () => {
		const { p, org, reportId } = await sendReport();
		const token = signThreadLink(reportId);
		const opened = await fns.getThreadLinkFn({ data: { token } });
		expect(opened).toMatchObject({
			expired: false,
			project: "Web app",
			thread: { status: "received", messages: [] },
		});
		await fns.replyThreadLinkFn({ data: { token, body: "Still broken" } });
		await fns.markThreadLinkReadFn({ data: { token } });

		const forged = `${reportId}.${Math.floor(Date.now() / 1000) + 999}.AAAA`;
		expect(
			await statusOf(fns.getThreadLinkFn({ data: { token: forged } })),
		).toBe(404);
		expect(
			await statusOf(
				fns.replyThreadLinkFn({ data: { token: forged, body: "Injected" } }),
			),
		).toBe(404);

		as(await signedInMember(org.id));
		await fns.replyToReporterFn({
			data: { projectId: p.id, reportId, body: "Thanks, looking" },
		});
		const thread = await fns.getThreadLinkFn({ data: { token } });
		expect(JSON.stringify(thread)).toContain("Still broken");
		expect(JSON.stringify(thread)).toContain("Thanks, looking");
		expect(JSON.stringify(thread)).not.toContain("Injected");
	});

	it("limits messages to 20 per IP per 10 minutes", async () => {
		const { reportId } = await sendReport();
		const token = signThreadLink(reportId);
		for (let i = 0; i < 20; i++) {
			await fns.replyThreadLinkFn({ data: { token, body: `Message ${i}` } });
		}
		await expect(
			fns.replyThreadLinkFn({ data: { token, body: "One more" } }),
		).rejects.toMatchObject({
			status: 400,
			message: "Too many messages. Try again in a few minutes.",
		});
	});

	it("refuses an empty or too long message", async () => {
		const { reportId } = await sendReport();
		const token = signThreadLink(reportId);
		await expect(
			fns.replyThreadLinkFn({ data: { token, body: "" } }),
		).rejects.toThrow();
		await expect(
			fns.replyThreadLinkFn({ data: { token, body: "a".repeat(5001) } }),
		).rejects.toThrow();
		await expect(
			fns.getThreadLinkFn({ data: { token: "a".repeat(301) } }),
		).rejects.toThrow();
	});
});

describe("email notification settings", () => {
	it("belong to the signed-in person", async () => {
		const org = await createOrganization();
		const me = await signedInMember(org.id, "member", {
			email: "me@example.com",
		});
		const other = await signedInMember(org.id);
		as(me);
		const before = await fns.getNotificationSettingsFn();
		expect(before).toMatchObject({
			email: "me@example.com",
			isAdmin: false,
			settings: { assigned: true },
		});
		const after = await fns.updateNotificationSettingFn({
			data: { type: "assigned", on: false },
		});
		expect(after.settings.assigned).toBe(false);
		as(other);
		expect((await fns.getNotificationSettingsFn()).settings.assigned).toBe(
			true,
		);
	});

	it("can be stopped from a signed link without signing in", async () => {
		const org = await createOrganization();
		const me = await signedInMember(org.id);
		const token = signUnsubscribe({
			kind: "team",
			userId: me.userId,
			type: "assigned",
		});
		signOut();
		expect(await fns.getUnsubscribeFn({ data: { token } })).toMatchObject({
			kind: "team",
		});
		const forged = `${token.slice(0, -2)}xx`;
		expect(
			await statusOf(fns.getUnsubscribeFn({ data: { token: forged } })),
		).toBe(404);
		expect(await statusOf(fns.unsubscribeFn({ data: { token: forged } }))).toBe(
			404,
		);
		as(me);
		expect((await fns.getNotificationSettingsFn()).settings.assigned).toBe(
			true,
		);
		signOut();
		expect(await fns.unsubscribeFn({ data: { token } })).toEqual({ ok: true });
		as(me);
		expect((await fns.getNotificationSettingsFn()).settings.assigned).toBe(
			false,
		);
	});
});

describe("apps connected over OAuth", () => {
	const connect = async (userId: string, clientId: string) => {
		await db
			.insert(oauthClient)
			.values({
				id: randomUUID(),
				clientId,
				name: `App ${clientId}`,
				redirectUris: ["http://127.0.0.1/callback"],
			} as typeof oauthClient.$inferInsert)
			.onConflictDoNothing();
		await db.insert(oauthConsent).values({
			id: randomUUID(),
			clientId,
			userId,
			scopes: ["openid"],
			createdAt: new Date(),
			updatedAt: new Date(),
		} as typeof oauthConsent.$inferInsert);
		await db.insert(oauthAccessToken).values({
			id: randomUUID(),
			token: randomUUID(),
			clientId,
			userId,
			scopes: ["openid"],
			expiresAt: new Date(Date.now() + 3600_000),
			createdAt: new Date(),
		} as typeof oauthAccessToken.$inferInsert);
	};

	it("are listed and disconnected for their own person only", async () => {
		const org = await createOrganization();
		const me = await signedInMember(org.id);
		const other = await signedInMember(org.id);
		await connect(me.userId, "claude");
		await connect(other.userId, "claude");
		as(me);
		expect((await fns.listOAuthAppsFn()).map((a) => a.clientId)).toEqual([
			"claude",
		]);
		await fns.revokeOAuthAppFn({ data: { clientId: "claude" } });
		expect(await fns.listOAuthAppsFn()).toEqual([]);
		const left = await db.select().from(oauthConsent);
		expect(left.map((c) => c.userId)).toEqual([other.userId]);
		const tokens = await db.select().from(oauthAccessToken);
		expect(tokens.map((t) => t.userId)).toEqual([other.userId]);
		expect(
			await fns.getOAuthClientNameFn({ data: { clientId: "claude" } }),
		).toMatchObject({ name: "App claude" });
		expect(
			await fns.getOAuthClientNameFn({ data: { clientId: "unknown" } }),
		).toEqual({ name: null, uri: null });
	});
});

describe("privacy settings", () => {
	it("read a positive whole number of retention days only", async () => {
		const cases: Array<[string, number | null]> = [
			["", null],
			["30", 30],
			["0", null],
			["-5", null],
			["1.5", null],
			["abc", null],
		];
		for (const [value, expected] of cases) {
			vi.stubEnv("REPORT_RETENTION_DAYS", value);
			expect(await fns.getPrivacySettingsFn()).toEqual({
				retentionDays: expected,
			});
		}
	});
});
