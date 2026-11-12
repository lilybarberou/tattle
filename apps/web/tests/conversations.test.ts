import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { db } from "#/db";
import { project, report, reportMessage, webhookDelivery } from "#/db/schema";
import {
	Conversations,
	type ReporterAuth,
	readThreadLink,
	signThreadLink,
} from "#/server/Conversations";
import { Ingest } from "#/server/Ingest";
import { Issues } from "#/server/Issues";
import { handleReporterRequest } from "#/server/reporter-api";
import { hashReporterKey, identityHash } from "#/server/reporter-identity";
import {
	agentActor,
	createWebhookEndpoint,
	createWorkspace,
	reportPayload,
	userActor,
} from "./helpers/factories";
import { run, runFailure, setupTestDatabase, waitFor } from "./helpers/runtime";

setupTestDatabase();

const KEY_A = "device-A-key-0123456789-aaaaaaaaaaaa";
const KEY_B = "device-B-key-0123456789-bbbbbbbbbbbb";
const KEY_C = "device-C-key-0123456789-cccccccccccc";
const SECRET = "isk_test_secret";

const submit = (input: unknown, origin: string | null = null) =>
	run(Ingest.use((ingest) => ingest.submit(input, origin)));

const withSecret = async (projectId: string, secret = SECRET) =>
	db
		.update(project)
		.set({ identitySecret: secret })
		.where(eq(project.id, projectId));

const listMine = (auth: ReporterAuth) =>
	run(Conversations.use((c) => c.listMine(auth)));
const getMine = (auth: ReporterAuth, id: string) =>
	run(Conversations.use((c) => c.getMine(auth, id)));
type Service = Parameters<Parameters<typeof Conversations.use>[0]>[0];
const failure = <A, E>(f: (c: Service) => Effect.Effect<A, E>) =>
	runFailure(Conversations.use(f));
const reply = (projectId: string, reportId: string, body: string) =>
	run(Conversations.use((c) => c.reply(projectId, reportId, body, userActor)));

describe("Ingest with a reporter key", () => {
	it("stores only the key's hash, and a user id only when its hash is valid", async () => {
		const { project: p } = await createWorkspace();
		await withSecret(p.id);
		const verified = await submit(
			reportPayload(p.publicKey, {
				reporterKey: KEY_A,
				reporter: { id: "u-1" },
				userHash: identityHash(SECRET, "u-1"),
			}),
		);
		const unverified = await submit(
			reportPayload(p.publicKey, {
				reporterKey: KEY_A,
				reporter: { id: "u-1" },
				userHash: identityHash("another secret", "u-1"),
			}),
		);
		const rows = await db.select().from(report);
		const byId = new Map(rows.map((r) => [r.id, r]));
		expect(byId.get(verified.id)).toMatchObject({
			reporterKeyHash: hashReporterKey(KEY_A),
			verifiedUserId: "u-1",
		});
		expect(byId.get(unverified.id)?.verifiedUserId).toBeNull();
		expect(JSON.stringify(rows)).not.toContain(KEY_A);
	});

	it("refuses a malformed reporter key", async () => {
		const { project: p } = await createWorkspace();
		const error = await runFailure(
			Ingest.use((ingest) =>
				ingest.submit(
					reportPayload(p.publicKey, { reporterKey: "short" }),
					null,
				),
			),
		);
		expect(error._tag).toBe("InvalidInput");
	});
});

describe("Who sees which report", () => {
	it("shows a device its own reports, and nothing to another device", async () => {
		const { project: p } = await createWorkspace();
		const mine = await submit(
			reportPayload(p.publicKey, {
				reporterKey: KEY_A,
				message: "Checkout button does nothing\nSteps…",
			}),
		);
		await submit(reportPayload(p.publicKey, { reporterKey: KEY_B }));

		const a = await listMine({
			projectKey: p.publicKey,
			origin: null,
			reporterKey: KEY_A,
		});
		expect(a.reports).toEqual([
			expect.objectContaining({
				id: mine.id,
				title: "Checkout button does nothing",
				status: "received",
				unread: 0,
			}),
		]);
		// No message yet: the last activity is the report itself, in UTC.
		expect(a.reports[0]?.updatedAt).toBe(a.reports[0]?.createdAt);

		const other = { projectKey: p.publicKey, origin: null, reporterKey: KEY_C };
		expect((await listMine(other)).reports).toEqual([]);
		for (const attempt of [
			failure((c) => c.getMine(other, mine.id)),
			failure((c) => c.postMine(other, mine.id, "Hello")),
			failure((c) => c.markMineRead(other, mine.id)),
		]) {
			expect((await attempt)._tag).toBe("NotFound");
		}
		// No key at all: nothing.
		expect(
			(await listMine({ projectKey: p.publicKey, origin: null })).reports,
		).toEqual([]);
	});

	it("never trusts a user id without a valid hash", async () => {
		const { project: p } = await createWorkspace();
		await withSecret(p.id);
		const sent = await submit(
			reportPayload(p.publicKey, {
				reporterKey: KEY_A,
				reporter: { id: "u-1", email: "jo@example.com" },
				userHash: identityHash(SECRET, "u-1"),
			}),
		);
		for (const userHash of [
			undefined,
			"",
			"0".repeat(64),
			identityHash("guess", "u-1"),
		]) {
			const auth = {
				projectKey: p.publicKey,
				origin: null,
				userId: "u-1",
				userHash,
			};
			expect((await listMine(auth)).reports).toEqual([]);
			expect((await failure((c) => c.getMine(auth, sent.id)))._tag).toBe(
				"NotFound",
			);
		}
	});

	it("gives nothing to a user id when the project does not verify identities", async () => {
		const { project: p } = await createWorkspace();
		await submit(
			reportPayload(p.publicKey, {
				reporterKey: KEY_A,
				reporter: { id: "u-1" },
			}),
		);
		const auth = {
			projectKey: p.publicKey,
			origin: null,
			userId: "u-1",
			userHash: identityHash(SECRET, "u-1"),
		};
		expect((await listMine(auth)).reports).toEqual([]);
	});

	it("shows a verified user their reports from every device, and only to them", async () => {
		const { project: p } = await createWorkspace();
		await withSecret(p.id);
		const verified = (id: string, key: string) =>
			reportPayload(p.publicKey, {
				reporterKey: key,
				reporter: { id },
				userHash: identityHash(SECRET, id),
			});
		const fromA = await submit(verified("u-1", KEY_A));
		const fromB = await submit(verified("u-1", KEY_B));
		await submit(verified("u-2", KEY_A));
		// Sent from device A before signing in.
		const anonymous = await submit(
			reportPayload(p.publicKey, { reporterKey: KEY_A }),
		);

		const u1 = await listMine({
			projectKey: p.publicKey,
			origin: null,
			reporterKey: KEY_C,
			userId: "u-1",
			userHash: identityHash(SECRET, "u-1"),
		});
		expect(u1.reports.map((r) => r.id).sort()).toEqual(
			[fromA.id, fromB.id].sort(),
		);

		// Device A alone sees what was sent there anonymously, not what users
		// sent while signed in on it.
		const deviceA = await listMine({
			projectKey: p.publicKey,
			origin: null,
			reporterKey: KEY_A,
		});
		expect(deviceA.reports.map((r) => r.id)).toEqual([anonymous.id]);

		// Signed in on device A: their own reports and the device's anonymous ones.
		const u1OnA = await listMine({
			projectKey: p.publicKey,
			origin: null,
			reporterKey: KEY_A,
			userId: "u-1",
			userHash: identityHash(SECRET, "u-1"),
		});
		expect(u1OnA.reports.map((r) => r.id).sort()).toEqual(
			[fromA.id, fromB.id, anonymous.id].sort(),
		);
	});

	it("gives each device back every report it sent once verification is turned off", async () => {
		const { project: p } = await createWorkspace();
		await withSecret(p.id);
		const verified = await submit(
			reportPayload(p.publicKey, {
				reporterKey: KEY_A,
				reporter: { id: "u-1" },
				userHash: identityHash(SECRET, "u-1"),
			}),
		);
		const anonymous = await submit(
			reportPayload(p.publicKey, { reporterKey: KEY_A }),
		);
		await submit(
			reportPayload(p.publicKey, {
				reporterKey: KEY_B,
				reporter: { id: "u-1" },
				userHash: identityHash(SECRET, "u-1"),
			}),
		);
		const deviceA = {
			projectKey: p.publicKey,
			origin: null,
			reporterKey: KEY_A,
		};

		// On, with a missing or stale hash (a rotated secret rolling out): the
		// device still sees only its anonymous reports.
		await withSecret(p.id, "isk_rotated_secret");
		for (const userHash of [undefined, identityHash(SECRET, "u-1")]) {
			const auth = { ...deviceA, userId: "u-1", userHash };
			expect((await listMine(auth)).reports.map((r) => r.id)).toEqual([
				anonymous.id,
			]);
			expect((await failure((c) => c.getMine(auth, verified.id)))._tag).toBe(
				"NotFound",
			);
		}

		// Off: the device sees everything it sent, verified or not, and nothing
		// sent from another device.
		await db
			.update(project)
			.set({ identitySecret: null })
			.where(eq(project.id, p.id));
		expect((await listMine(deviceA)).reports.map((r) => r.id).sort()).toEqual(
			[verified.id, anonymous.id].sort(),
		);
		expect((await getMine(deviceA, verified.id)).id).toBe(verified.id);
		await run(Conversations.use((c) => c.postMine(deviceA, verified.id, "Hi")));
		await run(Conversations.use((c) => c.markMineRead(deviceA, verified.id)));
	});

	it("keeps each project's reports apart, and checks allowed origins", async () => {
		const { project: p } = await createWorkspace({
			allowedOrigins: ["https://shop.example.com"],
		});
		const { project: other } = await createWorkspace();
		await submit(
			reportPayload(p.publicKey, { reporterKey: KEY_A }),
			"https://shop.example.com",
		);
		expect(
			(
				await listMine({
					projectKey: other.publicKey,
					origin: null,
					reporterKey: KEY_A,
				})
			).reports,
		).toEqual([]);
		const blocked = await failure((c) =>
			c.listMine({
				projectKey: p.publicKey,
				origin: "https://evil.example",
				reporterKey: KEY_A,
			}),
		);
		expect(blocked._tag).toBe("InvalidInput");
		expect(
			(
				await failure((c) =>
					c.listMine({
						projectKey: "pk_nope",
						origin: null,
						reporterKey: KEY_A,
					}),
				)
			)._tag,
		).toBe("NotFound");
	});
});

describe("A conversation", () => {
	const setup = async () => {
		const { project: p } = await createWorkspace();
		const sent = await submit(
			reportPayload(p.publicKey, {
				reporterKey: KEY_A,
				message: "The export button is greyed out",
				reporter: { name: "Jo", email: "jo@example.com" },
			}),
		);
		const auth: ReporterAuth = {
			projectKey: p.publicKey,
			origin: null,
			reporterKey: KEY_A,
		};
		return { p, sent, auth };
	};

	it("shows the reporter the team's replies, never comments, issue titles or internal fields", async () => {
		const { p, sent, auth } = await setup();
		await run(
			Issues.use((issues) =>
				Effect.all(
					[
						issues.update(
							p.id,
							sent.issueNumber,
							{
								title: "Churn risk: ACME exports",
								priority: 1,
								labels: ["vip-account"],
							},
							userActor,
						),
						issues.addComment(
							p.id,
							sent.issueNumber,
							"Internal: they are on the old plan",
							userActor,
						),
					],
					{ concurrency: 1 },
				),
			),
		);
		await reply(p.id, sent.id, "Thanks Jo, we're on it.");

		const thread = await getMine(auth, sent.id);
		expect(thread).toMatchObject({
			title: "The export button is greyed out",
			message: "The export button is greyed out",
			status: "received",
			messages: [
				{ from: "team", name: userActor.name, body: "Thanks Jo, we're on it." },
			],
		});
		const exposed = JSON.stringify([thread, await listMine(auth)]);
		for (const secret of [
			"Churn risk",
			"vip-account",
			"Internal:",
			"priority",
			"assignee",
			"jo@example.com",
		])
			expect(exposed).not.toContain(secret);
	});

	it("counts unread replies until the reporter reads them", async () => {
		const { p, sent, auth } = await setup();
		await reply(p.id, sent.id, "Which browser?");
		await reply(p.id, sent.id, "And which page?");
		expect(await listMine(auth)).toMatchObject({
			unread: 2,
			reports: [{ unread: 2 }],
		});

		await run(Conversations.use((c) => c.markMineRead(auth, sent.id)));
		expect((await listMine(auth)).unread).toBe(0);
		const rows = await db.select().from(reportMessage);
		expect(rows.every((m) => m.readAt !== null)).toBe(true);
	});

	it("lets the reporter answer, and flags the issue until the team replies", async () => {
		const { p, sent, auth } = await setup();
		await createWebhookEndpoint(p.id, "http://127.0.0.1:9/hook", {
			events: ["message.created"],
		});
		const posted = await run(
			Conversations.use((c) =>
				c.postMine(auth, sent.id, "  Firefox, on the reports page  "),
			),
		);
		expect(posted).toMatchObject({
			from: "reporter",
			name: null,
			body: "Firefox, on the reports page",
		});

		const awaiting = async () =>
			(await run(Issues.use((issues) => issues.list({ projectId: p.id }))))[0]
				?.awaitingReply;
		expect(await awaiting()).toBe(true);
		const detail = await run(
			Issues.use((issues) => issues.get(p.id, sent.issueNumber)),
		);
		expect(detail.reports[0]).toMatchObject({
			awaitingReply: true,
			reachable: { inApp: true, email: true },
			messages: [
				{ from: "reporter", author: { type: "reporter", name: "Jo" } },
			],
		});

		await run(
			Conversations.use((c) =>
				c.reply(p.id, sent.id, "Fixed in 1.4.3", agentActor),
			),
		);
		expect(await awaiting()).toBe(false);

		const deliveries = await waitFor(async () => {
			const rows = await db.select().from(webhookDelivery);
			return rows.length === 2 ? rows : undefined;
		});
		expect(deliveries.map((d) => d.event)).toEqual([
			"message.created",
			"message.created",
		]);
		const payloads = deliveries.map(
			(d) =>
				(d.payload as { data: { message: { from: string } } }).data.message
					.from,
		);
		expect(payloads.sort()).toEqual(["reporter", "team"]);
	});

	it("refuses empty and overlong messages", async () => {
		const { p, sent, auth } = await setup();
		for (const body of ["   ", "x".repeat(5001)]) {
			expect((await failure((c) => c.postMine(auth, sent.id, body)))._tag).toBe(
				"InvalidInput",
			);
			expect(
				(await failure((c) => c.reply(p.id, sent.id, body, userActor)))._tag,
			).toBe("InvalidInput");
		}
	});

	it("lets the team reply only to reports of its project", async () => {
		const { sent } = await setup();
		const { project: other } = await createWorkspace();
		const error = await failure((c) =>
			c.reply(other.id, sent.id, "Hello", userActor),
		);
		expect(error._tag).toBe("NotFound");
	});

	it("tells the reporter the status in their words, following a duplicate to its original", async () => {
		const { p, sent, auth } = await setup();
		const second = await submit(
			reportPayload(p.publicKey, { message: "Exports are broken" }),
		);
		await run(
			Issues.use((issues) =>
				issues.update(
					p.id,
					second.issueNumber,
					{ status: "in_progress" },
					userActor,
				),
			),
		);
		await run(
			Issues.use((issues) =>
				issues.update(p.id, sent.issueNumber, { status: "todo" }, userActor),
			),
		);
		expect((await getMine(auth, sent.id)).status).toBe("planned");

		await run(
			Issues.use((issues) =>
				issues.markDuplicate(
					p.id,
					sent.issueNumber,
					second.issueNumber,
					userActor,
				),
			),
		);
		// Its report now lives on the original…
		expect((await getMine(auth, sent.id)).status).toBe("in_progress");
		// …and even pointed back at the duplicate, it shows the original's status.
		await db
			.update(report)
			.set({ issueId: await issueId(p.id, sent.issueNumber) })
			.where(eq(report.id, sent.id));
		expect((await getMine(auth, sent.id)).status).toBe("in_progress");

		await run(
			Issues.use((issues) =>
				issues.update(
					p.id,
					second.issueNumber,
					{ status: "canceled" },
					userActor,
				),
			),
		);
		expect((await listMine(auth)).reports[0]?.status).toBe("wont_fix");
	});
});

describe("Email links", () => {
	it("opens the conversation with a valid link, and lets the reporter answer", async () => {
		const { project: p } = await createWorkspace();
		const sent = await submit(
			reportPayload(p.publicKey, { message: "Login loops" }),
		);
		await reply(p.id, sent.id, "Can you try again?");
		const token = signThreadLink(sent.id);

		const opened = await run(Conversations.use((c) => c.openLink(token)));
		expect(opened).toMatchObject({
			expired: false,
			project: p.name,
			thread: { title: "Login loops", messages: [{ from: "team" }] },
		});
		await run(Conversations.use((c) => c.markLinkRead(token)));
		expect((await db.select().from(reportMessage))[0]?.readAt).not.toBeNull();

		await run(Conversations.use((c) => c.postFromLink(token, "Still looping")));
		const rows = await db.select().from(reportMessage);
		expect(rows.map((r) => r.authorType)).toContain("reporter");
	});

	it("says an expired link has expired, and refuses answers through it", async () => {
		const { project: p } = await createWorkspace();
		const sent = await submit(reportPayload(p.publicKey));
		const token = signThreadLink(sent.id, Date.now() - 1000);
		expect(readThreadLink(token)).toBe("expired");
		expect(await run(Conversations.use((c) => c.openLink(token)))).toEqual({
			expired: true,
		});
		expect((await failure((c) => c.postFromLink(token, "Hello")))._tag).toBe(
			"InvalidInput",
		);
	});

	it("refuses a tampered link", async () => {
		const { project: p } = await createWorkspace();
		const mine = await submit(reportPayload(p.publicKey));
		const other = await submit(reportPayload(p.publicKey));
		const token = signThreadLink(mine.id);
		const [, expires, signature] = token.split(".");
		const tampered = [
			`${other.id}.${expires}.${signature}`,
			`${mine.id}.${Number(expires) + 3600}.${signature}`,
			`${mine.id}.${expires}.${signature?.slice(0, -2)}xx`,
			`${mine.id}.${expires}`,
			"",
		];
		for (const t of tampered) {
			expect(readThreadLink(t)).toBeNull();
			expect((await failure((c) => c.openLink(t)))._tag).toBe("NotFound");
			expect((await failure((c) => c.postFromLink(t, "Hi")))._tag).toBe(
				"NotFound",
			);
		}
	});
});

describe("GET/POST /api/v1/my-reports", () => {
	const request = (
		path: string,
		init: RequestInit & { headers?: Record<string, string> } = {},
	) =>
		handleReporterRequest(
			new Request(`http://localhost:3000/api/v1/my-reports${path}`, init),
			path.replace(/^\//, ""),
			`test-${Math.random()}`,
		);

	it("refuses a chunked message body over the cap without reading all of it", async () => {
		const { project: p } = await createWorkspace();
		const sent = await submit(
			reportPayload(p.publicKey, { reporterKey: KEY_A }),
		);
		let pulled = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled++;
				controller.enqueue(new Uint8Array(16 * 1024).fill(32));
			},
		});
		const response = await request(`/${sent.id}/messages`, {
			method: "POST",
			headers: {
				"x-tattle-project-key": p.publicKey,
				"x-tattle-reporter-key": KEY_A,
				"content-type": "application/json",
			},
			body,
			duplex: "half",
		} as RequestInit & { headers: Record<string, string> });
		expect(response.status).toBe(413);
		expect(pulled).toBeLessThan(20);
		expect(await db.select().from(reportMessage)).toEqual([]);
	});

	it("lists, opens, answers and marks read with the device's key", async () => {
		const { project: p } = await createWorkspace();
		const sent = await submit(
			reportPayload(p.publicKey, { reporterKey: KEY_A }),
		);
		await reply(p.id, sent.id, "Hello from the team");
		const headers = {
			"x-tattle-project-key": p.publicKey,
			"x-tattle-reporter-key": KEY_A,
		};

		const list = await request("", { headers });
		expect(list.status).toBe(200);
		expect(await list.json()).toMatchObject({
			unread: 1,
			reports: [{ id: sent.id }],
		});

		const thread = await request(`/${sent.id}`, { headers });
		expect(await thread.json()).toMatchObject({
			messages: [{ body: "Hello from the team" }],
		});

		const posted = await request(`/${sent.id}/messages`, {
			method: "POST",
			headers: { ...headers, "content-type": "application/json" },
			body: JSON.stringify({ body: "Thanks!" }),
		});
		expect(posted.status).toBe(201);

		const read = await request(`/${sent.id}/read`, { method: "POST", headers });
		expect(await read.json()).toEqual({ ok: true });
		expect(await (await request("", { headers })).json()).toMatchObject({
			unread: 0,
		});
	});

	it("answers 404 for another device's report and for unknown paths", async () => {
		const { project: p } = await createWorkspace();
		const sent = await submit(
			reportPayload(p.publicKey, { reporterKey: KEY_A }),
		);
		const headers = {
			"x-tattle-project-key": p.publicKey,
			"x-tattle-reporter-key": KEY_B,
		};
		expect((await request(`/${sent.id}`, { headers })).status).toBe(404);
		expect(
			(
				await request(`/${sent.id}/messages`, {
					method: "POST",
					headers,
					body: JSON.stringify({ body: "Hi" }),
				})
			).status,
		).toBe(404);
		expect(
			(await request(`/${sent.id}/nope`, { method: "POST", headers })).status,
		).toBe(404);
	});

	it("answers preflights for the widget's headers", async () => {
		const response = await request("", {
			method: "OPTIONS",
			headers: { origin: "https://shop.example.com" },
		});
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe(
			"https://shop.example.com",
		);
		expect(response.headers.get("access-control-allow-headers")).toContain(
			"x-tattle-reporter-key",
		);
	});
});

const issueId = async (projectId: string, number: number) => {
	const detail = await run(
		Issues.use((issues) => issues.get(projectId, number)),
	);
	return detail.issue.id;
};
