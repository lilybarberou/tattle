import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import {
	issue,
	member as membership,
	report,
	webhookEndpoint,
} from "#/db/schema";
import type { Actor } from "#/server/Access";
import { AiSettings, REFUSALS_BEFORE_EMAIL } from "#/server/AiSettings";
import { backgroundSettled } from "#/server/background";
import { Conversations, type ReporterAuth } from "#/server/Conversations";
import { Duplicates } from "#/server/Duplicates";
import { Ingest } from "#/server/Ingest";
import { Issues } from "#/server/Issues";
import { captureMail, type Mail, stopCapturingMail } from "#/server/mailer";
import { Notifications } from "#/server/Notifications";
import {
	readUnsubscribe,
	signUnsubscribe,
	unsubscribePageUrl,
} from "#/server/unsubscribe";
import { Webhooks } from "#/server/Webhooks";
import type { NotificationType } from "#/shared/notifications";
import {
	addMember,
	agentActor,
	createUser,
	createWebhookEndpoint,
	createWorkspace,
	reportPayload,
} from "./helpers/factories";
import { startReceiver } from "./helpers/http";
import { run, setupTestDatabase, waitFor } from "./helpers/runtime";

setupTestDatabase();

const KEY = "device-A-key-0123456789-aaaaaaaaaaaa";
const MINUTE = 60_000;

let outbox: Mail[];
beforeEach(() => {
	outbox = captureMail();
});
afterEach(async () => {
	await run(backgroundSettled);
	stopCapturingMail();
	vi.restoreAllMocks();
	delete process.env.TRIAGE_DIGEST_HOUR;
});

/** Mails sent so far, once the background work is done. */
const sent = async () => {
	await run(backgroundSettled);
	return outbox;
};
const to = async (email: string) =>
	(await sent()).filter((mail) => mail.to === email);

/** A workspace with an owner, an admin and a member, and one project. */
const team = async () => {
	const { org, project: p } = await createWorkspace();
	const people = async (role: "owner" | "admin" | "member", name: string) => {
		const person = await createUser({ name });
		await addMember(org.id, person.id, role);
		const actor: Actor = { type: "user", id: person.id, name: person.name };
		return { ...person, actor };
	};
	return {
		org,
		p,
		owner: await people("owner", "Olive Owner"),
		admin: await people("admin", "Adam Admin"),
		member: await people("member", "Mia Member"),
	};
};

const submit = (
	projectKey: string,
	message = "The export button is greyed out",
) =>
	run(
		Ingest.use((ingest) =>
			ingest.submit(
				reportPayload(projectKey, {
					message,
					reporterKey: KEY,
					reporter: { name: "Jo", email: "jo@example.com" },
				}),
				null,
			),
		),
	);

const assign = (
	projectId: string,
	number: number,
	userId: string,
	actor: Actor,
) =>
	run(
		Issues.use((issues) =>
			issues.update(
				projectId,
				number,
				{ assignee: { type: "user", id: userId, name: "Someone" } },
				actor,
			),
		),
	);

const setting = (userId: string, type: NotificationType, on: boolean) =>
	run(Notifications.use((n) => n.updateSetting(userId, type, on)));

describe("A reporter answered", () => {
	const reporterWrites = (
		projectKey: string,
		reportId: string,
		body: string,
	) => {
		const auth: ReporterAuth = { projectKey, origin: null, reporterKey: KEY };
		return run(Conversations.use((c) => c.postMine(auth, reportId, body)));
	};
	const sweep = (inMinutes: number) =>
		run(
			Notifications.use((n) =>
				n.sendReporterMessages(new Date(Date.now() + inMinutes * MINUTE)),
			),
		);

	it("emails the assignee once for the messages of a 10-minute window", async () => {
		const { p, owner, member } = await team();
		const sent1 = await submit(p.publicKey);
		await assign(p.id, 1, member.id, owner.actor);
		await reporterWrites(p.publicKey, sent1.id, "It happens on Firefox only");
		await reporterWrites(p.publicKey, sent1.id, "And <b>only</b> on Mondays");

		expect(await sweep(0)).toBe(0);
		expect(await sweep(11)).toBe(1);
		// Idempotent: the same messages are never emailed twice.
		expect(await sweep(12)).toBe(0);

		const mails = (await to(member.email)).filter((m) =>
			m.subject.startsWith("Reporter answered"),
		);
		expect(mails).toHaveLength(1);
		const [mail] = mails as [Mail];
		expect(mail.subject).toBe(
			"Reporter answered: #1 The export button is greyed out",
		);
		expect(mail.text).toContain("Jo, who reported #1");
		expect(mail.text).toContain("“It happens on Firefox only”");
		expect(mail.text).toContain("“And <b>only</b> on Mondays”");
		expect(mail.text).toContain("Written by the reporter, not by your team");
		expect(mail.action?.url).toBe(`http://localhost:3000/p/${p.id}/issues/1`);
		// Nobody else hears about it.
		expect(
			(await sent()).filter((m) => m.subject.startsWith("Reporter answered")),
		).toHaveLength(1);

		// A later message opens a new window.
		await reporterWrites(p.publicKey, sent1.id, "Still broken");
		expect(await sweep(11)).toBe(1);
		const last = (await to(member.email)).at(-1);
		expect(last?.text).toContain("“Still broken”");
		expect(last?.text).not.toContain("Firefox");
	});

	it("goes to the team members who replied, then to owners and admins", async () => {
		const { p, owner, admin, member } = await team();
		const first = await submit(p.publicKey, "Export is broken");
		const second = await submit(p.publicKey, "Login loops forever");
		await run(
			Conversations.use((c) =>
				c.reply(p.id, first.id, "Which browser?", member.actor),
			),
		);
		await reporterWrites(p.publicKey, first.id, "Firefox");
		await reporterWrites(p.publicKey, second.id, "Any news?");
		expect(await sweep(11)).toBe(2);

		const subjects = async (email: string) =>
			(await to(email))
				.filter((m) => m.subject.startsWith("Reporter answered"))
				.map((m) => m.subject);
		expect(await subjects(member.email)).toEqual([
			"Reporter answered: #1 Export is broken",
		]);
		expect(await subjects(owner.email)).toEqual([
			"Reporter answered: #2 Login loops forever",
		]);
		expect(await subjects(admin.email)).toEqual([
			"Reporter answered: #2 Login loops forever",
		]);
	});

	it("skips former members and people who turned it off", async () => {
		const { org, p, owner, admin, member } = await team();
		const sent1 = await submit(p.publicKey);
		await assign(p.id, 1, member.id, owner.actor);
		await db
			.delete(membership)
			.where(
				and(
					eq(membership.organizationId, org.id),
					eq(membership.userId, member.id),
				),
			);
		await setting(admin.id, "reporter_replied", false);
		await reporterWrites(p.publicKey, sent1.id, "Hello?");
		await sweep(11);

		const replies = (await sent()).filter((m) =>
			m.subject.startsWith("Reporter answered"),
		);
		expect(replies.map((m) => m.to)).toEqual([owner.email]);
	});

	it("says nothing when the team already answered", async () => {
		const { p, owner } = await team();
		const sent1 = await submit(p.publicKey);
		await reporterWrites(p.publicKey, sent1.id, "Hello?");
		await run(
			Conversations.use((c) => c.reply(p.id, sent1.id, "Hi Jo!", owner.actor)),
		);
		expect(await sweep(11)).toBe(0);
	});
});

describe("Assigned to you", () => {
	it("emails the new assignee when someone else or an agent assigns them", async () => {
		const { p, owner, member } = await team();
		await submit(p.publicKey);
		await assign(p.id, 1, member.id, owner.actor);

		const [mail, ...rest] = await to(member.email);
		expect(rest).toHaveLength(0);
		expect(mail).toMatchObject({
			subject: "Assigned to you: #1 The export button is greyed out",
			text: "Olive Owner assigned you #1 “The export button is greyed out” in Web app.",
			action: {
				label: "Open the issue",
				url: `http://localhost:3000/p/${p.id}/issues/1`,
			},
		});
		// The footer and the one-click unsubscribe headers.
		const token = signUnsubscribe({
			kind: "team",
			userId: member.id,
			type: "assigned",
		});
		expect(mail?.footer?.links).toEqual([
			{
				label: "Notification settings",
				url: "http://localhost:3000/notifications",
			},
			{
				label: "Unsubscribe from these emails",
				url: unsubscribePageUrl(token),
			},
		]);
		expect(mail?.headers).toEqual({
			"List-Unsubscribe": `<http://localhost:3000/api/v1/unsubscribe/${token}>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		});

		await run(
			Issues.use((issues) =>
				issues.update(p.id, 1, { assignee: null }, owner.actor),
			),
		);
		await assign(p.id, 1, member.id, agentActor);
		expect((await to(member.email)).at(-1)?.text).toContain(
			"Bot (agent) assigned you #1",
		);
	});

	it("is never sent to someone who assigns themselves, or who turned it off", async () => {
		const { p, owner, member } = await team();
		await submit(p.publicKey);
		await assign(p.id, 1, member.id, member.actor);
		await setting(owner.id, "assigned", false);
		await assign(p.id, 1, owner.id, member.actor);
		expect(await sent()).toEqual([]);
	});

	it("is not sent to someone who is no longer a member", async () => {
		const { p, owner } = await team();
		const outsider = await createUser();
		await submit(p.publicKey);
		await assign(p.id, 1, outsider.id, owner.actor);
		expect(await sent()).toEqual([]);
	});
});

describe("A fixed bug came back", () => {
	const doneThenAgain = async (
		p: { id: string; publicKey: string },
		actor: Actor,
	) => {
		await submit(p.publicKey);
		await run(
			Issues.use((issues) => issues.update(p.id, 1, { status: "done" }, actor)),
		);
		const later = await run(
			Ingest.use((ingest) =>
				ingest.submit(reportPayload(p.publicKey, { release: "1.5.0" }), null),
			),
		);
		return later;
	};

	it("goes to owners and admins when nobody is assigned, never to whoever moved the report", async () => {
		const { p, owner, admin, member } = await team();
		const later = await doneThenAgain(p, owner.actor);
		await run(
			Issues.use((issues) => issues.moveReport(p.id, later.id, 1, owner.actor)),
		);
		const regressions = (await sent()).filter((m) =>
			m.subject.startsWith("Regression"),
		);
		expect(regressions.map((m) => m.to)).toEqual([admin.email]);
		expect(regressions[0]).toMatchObject({
			subject: "Regression: #1 The export button is greyed out",
			text: "#1 “The export button is greyed out” in Web app was done, and a newer report came in from release 1.5.0. It was reopened and moved to Todo.",
		});
		expect(await to(member.email)).toEqual([]);
	});

	it("goes to the assignee when there is one", async () => {
		const { p, owner, admin, member } = await team();
		const later = await doneThenAgain(p, owner.actor);
		await assign(p.id, 1, member.id, member.actor);
		await run(
			Issues.use((issues) => issues.moveReport(p.id, later.id, 1, agentActor)),
		);
		const regressions = (await sent()).filter((m) =>
			m.subject.startsWith("Regression"),
		);
		expect(regressions.map((m) => m.to)).toEqual([member.email]);
		expect(await to(admin.email)).toEqual([]);
	});
});

describe("Daily triage digest", () => {
	const digest = (now = new Date()) =>
		run(Notifications.use((n) => n.sendDigests(now)));
	const digests = async () =>
		(await sent()).filter((m) => m.subject.startsWith("Triage"));

	it("goes to owners and admins by default, once a day, only with something new", async () => {
		process.env.TRIAGE_DIGEST_HOUR = "0";
		const { p, owner, admin, member } = await team();
		await submit(p.publicKey, "Export is broken");
		await submit(p.publicKey, "Login loops forever");
		await submit(p.publicKey, "Already triaged");
		await run(
			Issues.use((issues) =>
				issues.update(p.id, 3, { status: "todo" }, owner.actor),
			),
		);

		expect(await digest()).toBe(2);
		const mails = await digests();
		expect(mails.map((m) => m.to).sort()).toEqual(
			[owner.email, admin.email].sort(),
		);
		expect(mails[0]).toMatchObject({
			subject: "Triage: 2 new in Web app",
			lists: [
				{
					title: "Web app: 2 new",
					url: `http://localhost:3000/p/${p.id}/triage`,
					items: [
						{
							label: "#2 Login loops forever",
							url: `http://localhost:3000/p/${p.id}/issues/2`,
						},
						{
							label: "#1 Export is broken",
							url: `http://localhost:3000/p/${p.id}/issues/1`,
						},
					],
				},
			],
		});
		expect(await to(member.email)).toEqual([]);

		// The same day again, after a restart: nothing.
		expect(await digest()).toBe(0);
		// The next day, nothing new: nothing.
		const tomorrow = new Date(Date.now() + 24 * 3600_000);
		expect(await digest(tomorrow)).toBe(0);
		// A day later with a report sent after the last digest: only that one.
		await submit(p.publicKey, "Dark mode please");
		await db
			.update(issue)
			.set({ createdAt: new Date(Date.now() + 25 * 3600_000) })
			.where(and(eq(issue.projectId, p.id), eq(issue.number, 4)));
		expect(await digest(new Date(Date.now() + 48 * 3600_000))).toBe(2);
		expect((await digests()).at(-1)?.lists?.[0]?.items).toEqual([
			{
				label: "#4 Dark mode please",
				url: `http://localhost:3000/p/${p.id}/issues/4`,
			},
		]);
	});

	it("waits for the hour, and follows each person's choice", async () => {
		const { p, owner, member } = await team();
		await submit(p.publicKey);
		const today = new Date().toISOString().slice(0, 10);
		process.env.TRIAGE_DIGEST_HOUR = "23";
		expect(await digest(new Date(`${today}T22:59:00Z`))).toBe(0);

		process.env.TRIAGE_DIGEST_HOUR = "0";
		await setting(member.id, "triage_digest", true);
		await setting(owner.id, "triage_digest", false);
		await digest();
		expect((await digests()).map((m) => m.to)).not.toContain(owner.email);
		expect((await digests()).map((m) => m.to)).toContain(member.email);
	});
});

describe("The AI key stopped working", () => {
	const enableAi = async (organizationId: string, ownerId: string) =>
		run(
			AiSettings.use((s) =>
				s.save(
					{
						kind: "user",
						userId: ownerId,
						name: "Olive",
						organizationIds: [organizationId],
					},
					organizationId,
					{ provider: "anthropic", apiKey: "sk-ant-test-1234", enabled: true },
				),
			),
		);
	const providerAnswers = (status: number) =>
		vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
			status === 200
				? new Response(
						JSON.stringify({
							content: [{ type: "text", text: '{"duplicateOf":null}' }],
						}),
					)
				: new Response(JSON.stringify({ error: { message: "nope" } }), {
						status,
					}),
		);

	it("tells owners and admins after repeated refusals, at most once a day", async () => {
		const { org, p, owner, admin, member } = await team();
		await enableAi(org.id, owner.id);
		await run(
			Issues.use((issues) =>
				issues.create(
					p.id,
					{ type: "bug", title: "The export button is greyed out" },
					owner.actor,
				),
			),
		);
		// Without Ingest's own background check, so the count is exact.
		const [row] = await db
			.insert(report)
			.values({
				projectId: p.id,
				type: "bug",
				message: "The export button is greyed out again",
				pageUrl: "https://example.com",
				device: {},
				console: [],
				network: [],
			})
			.returning();
		const created = await run(
			Issues.use((issues) => issues.createFromReport(p.id, row as never)),
		);
		const issueId = (
			await run(Issues.use((issues) => issues.get(p.id, created.number)))
		).issue.id;
		const check = () => run(Duplicates.use((d) => d.suggest(issueId)));

		providerAnswers(401);
		for (let i = 1; i < REFUSALS_BEFORE_EMAIL; i++) await check();
		expect(await sent()).toEqual([]);
		await check();
		const mails = await sent();
		expect(mails.map((m) => m.to).sort()).toEqual(
			[owner.email, admin.email].sort(),
		);
		expect(mails[0]).toMatchObject({
			subject: "Your AI key for duplicate suggestions stopped working",
			action: { url: "http://localhost:3000/agents#duplicates" },
		});
		expect(mails[0]?.text).toContain(
			"HTTP 401, the key is invalid or was revoked",
		);
		expect(mails[0]?.text).not.toContain("sk-ant");
		expect(await to(member.email)).toEqual([]);

		// More refusals the same day: no more emails.
		await check();
		await check();
		expect(await sent()).toHaveLength(2);

		// A server error is not the key's fault; a success starts over.
		vi.restoreAllMocks();
		providerAnswers(500);
		await check();
		vi.restoreAllMocks();
		providerAnswers(200);
		await check();
		expect(await sent()).toHaveLength(2);
	});
});

describe("A webhook keeps failing", () => {
	it("tells owners and admins once, until a delivery works again", async () => {
		const { p, owner, admin } = await team();
		const endpoint = await createWebhookEndpoint(
			p.id,
			"https://discord.com/api/webhooks/123/secret-token",
			{ format: "discord" },
		);
		const fail = () =>
			run(
				Notifications.use((n) =>
					n.webhookFailing(endpoint.id, "issue.created", "HTTP 500"),
				),
			);
		await fail();
		await fail();
		const mails = await sent();
		expect(mails.map((m) => m.to).sort()).toEqual(
			[owner.email, admin.email].sort(),
		);
		expect(mails[0]).toMatchObject({
			subject: "A Discord channel of Web app keeps failing",
			action: {
				url: `http://localhost:3000/p/${p.id}/settings#notifications`,
			},
		});
		expect(mails[0]?.text).toContain("discord.com");
		expect(mails[0]?.text).not.toContain("secret-token");

		// A successful delivery clears it: the next outage is told again.
		const receiver = await startReceiver(200);
		try {
			await db
				.update(webhookEndpoint)
				.set({ url: receiver.url, format: "json" })
				.where(eq(webhookEndpoint.id, endpoint.id));
			await run(
				Webhooks.use((w) => w.emit(p.id, "issue.created", { test: true })),
			);
			await waitFor(async () => {
				const [row] = await db
					.select()
					.from(webhookEndpoint)
					.where(eq(webhookEndpoint.id, endpoint.id));
				return row?.failureNotifiedAt === null;
			});
		} finally {
			await receiver.close();
		}
		await fail();
		expect(await sent()).toHaveLength(4);
	});
});

describe("Unsubscribe links", () => {
	it("turn off one kind of email for one person, and refuse tampered tokens", async () => {
		const { p, owner, member } = await team();
		const token = signUnsubscribe({
			kind: "team",
			userId: member.id,
			type: "assigned",
		});
		expect(readUnsubscribe(token)).toEqual({
			kind: "team",
			userId: member.id,
			type: "assigned",
		});
		const [, , , signature] = token.split(".");
		const forged = [
			`u.${owner.id}.assigned.${signature}`,
			`u.${member.id}.regression.${signature}`,
			`${token.slice(0, -2)}xx`,
			"u.x.assigned",
			"",
		];
		for (const bad of forged) {
			expect(readUnsubscribe(bad)).toBeNull();
			expect(await run(Notifications.use((n) => n.unsubscribe(bad)))).toBe(
				false,
			);
		}

		expect(
			await run(Notifications.use((n) => n.describeUnsubscribe(token))),
		).toEqual({ kind: "team", label: "Assigned to you" });
		expect(await run(Notifications.use((n) => n.unsubscribe(token)))).toBe(
			true,
		);
		const view = await run(Notifications.use((n) => n.settings(member.id)));
		expect(view.settings).toMatchObject({
			assigned: false,
			reporter_replied: true,
			triage_digest: false,
		});
		const ownerView = await run(Notifications.use((n) => n.settings(owner.id)));
		expect(ownerView.settings.assigned).toBe(true);
		expect(ownerView.settings.triage_digest).toBe(true);

		await submit(p.publicKey);
		await assign(p.id, 1, member.id, owner.actor);
		expect(await to(member.email)).toEqual([]);
	});

	it("stop the replies and the shipped notice of one report for its reporter", async () => {
		const { p, owner } = await team();
		const feature = await run(
			Ingest.use((ingest) =>
				ingest.submit(
					reportPayload(p.publicKey, {
						type: "feature",
						message: "Dark mode",
						reporter: { name: "Jo", email: "jo@example.com" },
					}),
					null,
				),
			),
		);
		await run(
			Conversations.use((c) =>
				c.reply(p.id, feature.id, "Noted, thanks!", owner.actor),
			),
		);
		const [reply] = await to("jo@example.com");
		const token = signUnsubscribe({ kind: "report", reportId: feature.id });
		expect(reply?.footer?.links).toEqual([
			{
				label: "Stop emails about this report",
				url: unsubscribePageUrl(token),
			},
		]);
		expect(reply?.headers?.["List-Unsubscribe-Post"]).toBe(
			"List-Unsubscribe=One-Click",
		);
		expect(
			await run(Notifications.use((n) => n.describeUnsubscribe(token))),
		).toEqual({ kind: "report", project: "Web app", title: "Dark mode" });

		expect(await run(Notifications.use((n) => n.unsubscribe(token)))).toBe(
			true,
		);
		await run(
			Conversations.use((c) =>
				c.reply(p.id, feature.id, "Shipping soon", owner.actor),
			),
		);
		await run(
			Issues.use((issues) =>
				issues.update(
					p.id,
					feature.issueNumber,
					{ status: "done" },
					owner.actor,
				),
			),
		);
		expect(await to("jo@example.com")).toHaveLength(1);
	});
});

describe("Without SMTP", () => {
	it("sends nothing, logs nothing and fails nothing", async () => {
		stopCapturingMail();
		process.env.TRIAGE_DIGEST_HOUR = "0";
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		const errors = vi.spyOn(console, "error");
		const { p, owner, member } = await team();
		const sent1 = await submit(p.publicKey);
		await assign(p.id, 1, member.id, owner.actor);
		await run(
			Conversations.use((c) =>
				c.postMine(
					{ projectKey: p.publicKey, origin: null, reporterKey: KEY },
					sent1.id,
					"Hello?",
				),
			),
		);
		const later = new Date(Date.now() + 11 * MINUTE);
		expect(
			await run(Notifications.use((n) => n.sendReporterMessages(later))),
		).toBe(0);
		expect(await run(Notifications.use((n) => n.sendDigests()))).toBe(0);
		await run(backgroundSettled);
		expect(info.mock.calls.flat().join("\n")).not.toContain("[mail]");
		expect(errors).not.toHaveBeenCalled();
		expect(outbox).toEqual([]);
	});
});
