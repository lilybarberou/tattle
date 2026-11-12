import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { activity, project } from "#/db/schema";
import {
	GitHub,
	issueReferences,
	signGithub,
	verifyGithubSignature,
} from "#/server/GitHub";
import { Ingest } from "#/server/Ingest";
import { type IssueStatus, Issues } from "#/server/Issues";
import { createWorkspace, reportPayload, userActor } from "./helpers/factories";
import { run, setupTestDatabase, waitFor } from "./helpers/runtime";

setupTestDatabase();

const PR_URL = "https://github.com/acme/shop/pull/34";

type PullRequest = {
	action?: string;
	merged?: boolean;
	draft?: boolean;
	base?: string;
	title?: string;
	body?: string | null;
	url?: string;
};

const pullRequest = (pr: PullRequest = {}) => ({
	action: pr.action ?? "closed",
	number: 34,
	pull_request: {
		number: 34,
		html_url: pr.url ?? PR_URL,
		title: pr.title ?? "Fix the checkout button",
		body: pr.body ?? null,
		merged: pr.merged ?? true,
		draft: pr.draft ?? false,
		base: { ref: pr.base ?? "main" },
	},
	repository: { full_name: "acme/shop", default_branch: "main" },
});

/** A project with GitHub sync on (or off), and its secret. */
const setup = async (enabled = true) => {
	const { project: p } = await createWorkspace();
	const settings = await run(
		GitHub.use((github) => github.setEnabled(p.id, enabled)),
	);
	return { project: p, secret: settings.secret as string };
};

const deliver = (
	projectId: string,
	secret: string | null,
	payload: unknown,
	event = "pull_request",
	signature?: string | null,
) => {
	const body = new TextEncoder().encode(JSON.stringify(payload));
	return run(
		GitHub.use((github) =>
			github.receive(projectId, {
				event,
				signature:
					signature !== undefined
						? signature
						: secret
							? signGithub(secret, body)
							: null,
				body,
			}),
		),
	);
};

const createIssue = async (
	projectId: string,
	input: {
		title?: string;
		status?: IssueStatus;
		type?: "bug" | "feature";
		prUrl?: string;
	} = {},
) => {
	const created = await run(
		Issues.use((issues) =>
			issues.create(
				projectId,
				{
					type: input.type ?? "bug",
					title: input.title ?? "Checkout button does nothing",
					status: input.status ?? "in_progress",
				},
				userActor,
			),
		),
	);
	if (input.prUrl) {
		await run(
			Issues.use((issues) =>
				issues.update(
					projectId,
					created.number,
					{ prUrl: input.prUrl },
					userActor,
				),
			),
		);
	}
	return created;
};

const issueOf = async (projectId: string, number: number) =>
	(await run(Issues.use((issues) => issues.get(projectId, number)))).issue;

describe("signatures", () => {
	it("accepts GitHub's sha256 signature and nothing else", () => {
		const body = new TextEncoder().encode(
			'{"zen":"Keep it logically awesome."}',
		);
		const signature = signGithub("s3cret", body);
		expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
		expect(verifyGithubSignature("s3cret", body, signature)).toBe(true);
		expect(verifyGithubSignature("other", body, signature)).toBe(false);
		expect(verifyGithubSignature("s3cret", body, null)).toBe(false);
		expect(verifyGithubSignature("s3cret", body, "sha256=00")).toBe(false);
		const tampered = new TextEncoder().encode('{"zen":"Keep it short."}');
		expect(verifyGithubSignature("s3cret", tampered, signature)).toBe(false);
	});

	it("answers a signed ping and records the delivery", async () => {
		const { project: p, secret } = await setup();
		const result = await deliver(p.id, secret, { zen: "Hi" }, "ping");
		expect(result).toEqual({
			status: 200,
			body: { ok: true, message: "Ping received" },
		});
		const settings = await run(GitHub.use((github) => github.settings(p.id)));
		expect(settings.lastDelivery).toBe("Ping received");
		expect(settings.lastDeliveryAt).not.toBeNull();
	});

	it("refuses a wrong or missing signature before doing anything", async () => {
		const { project: p, secret } = await setup();
		await createIssue(p.id, { prUrl: PR_URL });
		const wrong = await deliver(p.id, "not-the-secret", pullRequest());
		const missing = await deliver(
			p.id,
			secret,
			pullRequest(),
			"pull_request",
			null,
		);
		for (const result of [wrong, missing]) {
			expect(result.status).toBe(401);
			expect(result.body.ok).toBe(false);
		}
		expect((await issueOf(p.id, 1)).status).toBe("in_progress");
		const [row] = await db.select().from(project).where(eq(project.id, p.id));
		expect(row?.githubLastDeliveryAt).toBeNull();
	});

	it("answers an unknown project like a wrong signature", async () => {
		const { secret } = await setup();
		const result = await deliver(
			"no-such-project",
			secret,
			{ zen: "Hi" },
			"ping",
		);
		expect(result.status).toBe(401);
	});

	it("keeps the secret when turned off and on, and replaces it on demand", async () => {
		const { project: p, secret } = await setup();
		expect(secret).toMatch(/^[0-9a-f]{64}$/);
		await run(GitHub.use((github) => github.setEnabled(p.id, false)));
		const again = await run(
			GitHub.use((github) => github.setEnabled(p.id, true)),
		);
		expect(again.secret).toBe(secret);
		const renewed = await run(
			GitHub.use((github) => github.regenerateSecret(p.id)),
		);
		expect(renewed.secret).not.toBe(secret);
		expect((await deliver(p.id, secret, {}, "ping")).status).toBe(401);
		expect((await deliver(p.id, renewed.secret, {}, "ping")).status).toBe(200);
	});
});

describe("when the sync is off", () => {
	it("changes nothing", async () => {
		const { project: p, secret } = await setup(false);
		await createIssue(p.id, { prUrl: PR_URL });
		const result = await deliver(p.id, secret, pullRequest());
		expect(result.status).toBe(202);
		expect(result.body.issues).toBeUndefined();
		expect((await issueOf(p.id, 1)).status).toBe("in_progress");
	});

	it("is off for a new project, which has no secret", async () => {
		const { project: p } = await createWorkspace();
		const settings = await run(GitHub.use((github) => github.settings(p.id)));
		expect(settings).toMatchObject({ enabled: false, secret: null });
	});
});

describe("merged pull requests", () => {
	it("move the linked issue to Done as GitHub", async () => {
		const { project: p, secret } = await setup();
		await createIssue(p.id, { prUrl: PR_URL });
		await createIssue(p.id, { title: "Unrelated" });

		const result = await deliver(p.id, secret, pullRequest());
		expect(result).toEqual({
			status: 200,
			body: {
				ok: true,
				message: "Pull request #34 closed: moved #1 to Done",
				issues: [1],
			},
		});
		const detail = await run(Issues.use((issues) => issues.get(p.id, 1)));
		expect(detail.issue.status).toBe("done");
		expect(detail.activity.at(-1)).toMatchObject({
			actor: { type: "system", id: null, name: "GitHub" },
			action: "updated",
			data: { changes: { status: { from: "in_progress", to: "done" } } },
		});
		expect((await issueOf(p.id, 2)).status).toBe("in_progress");
	});

	it("tell the people who asked for a feature that it shipped", async () => {
		const { project: p, secret } = await setup();
		await run(
			Ingest.use((ingest) =>
				ingest.submit(
					reportPayload(p.publicKey, {
						type: "feature",
						message: "Dark mode",
						reporter: { email: "jo@example.com", name: "Jo" },
					}),
					null,
				),
			),
		);
		await run(
			Issues.use((issues) =>
				issues.update(p.id, 1, { status: "todo" }, userActor),
			),
		);
		const info = vi.spyOn(console, "info").mockImplementation(() => {});

		const result = await deliver(
			p.id,
			secret,
			pullRequest({ body: "Adds a dark theme.\n\nCloses Tattle #1" }),
		);
		expect(result.body.issues).toEqual([1]);
		const issue = await issueOf(p.id, 1);
		expect(issue).toMatchObject({ status: "done", prUrl: PR_URL });
		// Without SMTP the mailer logs what it would have sent.
		if (!process.env.SMTP_HOST) {
			await waitFor(() =>
				info.mock.calls.some((c) =>
					String(c[0]).includes("Shipped: Dark mode"),
				),
			);
		}
		info.mockRestore();
	});

	it("skip issues already done, declined or duplicate", async () => {
		const { project: p, secret } = await setup();
		await createIssue(p.id, { prUrl: PR_URL, status: "done" });
		await createIssue(p.id, { prUrl: PR_URL, status: "canceled" });
		const result = await deliver(p.id, secret, pullRequest());
		expect(result.body).toMatchObject({
			message: "Pull request #34 closed: no open linked issue",
			issues: [],
		});
		const updates = await db
			.select()
			.from(activity)
			.where(eq(activity.actorName, "GitHub"));
		expect(updates).toHaveLength(0);
	});

	it("into another branch, or closed without merging, change nothing", async () => {
		const { project: p, secret } = await setup();
		await createIssue(p.id, { prUrl: PR_URL });

		const otherBranch = await deliver(
			p.id,
			secret,
			pullRequest({ base: "develop" }),
		);
		expect(otherBranch.status).toBe(200);
		expect(otherBranch.body.message).toBe(
			"Pull request #34 closed: merged into develop, not main",
		);
		const unmerged = await deliver(
			p.id,
			secret,
			pullRequest({ merged: false }),
		);
		expect(unmerged.body.issues).toEqual([]);
		const otherRepo = await deliver(
			p.id,
			secret,
			pullRequest({ url: "https://github.com/acme/blog/pull/34" }),
		);
		expect(otherRepo.body.issues).toEqual([]);
		expect((await issueOf(p.id, 1)).status).toBe("in_progress");
	});

	it("ignore other events with a 2xx", async () => {
		const { project: p, secret } = await setup();
		const result = await deliver(
			p.id,
			secret,
			{ ref: "refs/heads/main" },
			"push",
		);
		expect(result).toEqual({
			status: 202,
			body: { ok: true, message: "Ignored: push event" },
		});
	});
});

describe("references", () => {
	it("read `Tattle #12` in any case, never a plain #12", () => {
		expect(
			issueReferences(
				"Fixes Tattle #12, tattle#7 and TATTLE  #3.\nAlso closes #40 and mytattle#5",
			),
		).toEqual([12, 7, 3]);
		expect(issueReferences("Fixes #12")).toEqual([]);
		expect(issueReferences("Tattle #2 and tattle #2")).toEqual([2]);
	});

	it("link issues from the title or body when the pull request is merged", async () => {
		const { project: p, secret } = await setup();
		await createIssue(p.id);
		await createIssue(p.id);
		await createIssue(p.id);
		const result = await deliver(
			p.id,
			secret,
			pullRequest({
				title: "Fix checkout (tattle#1)",
				body: "Also Tattle #2, not #3",
			}),
		);
		expect(result.body.issues).toEqual([1, 2]);
		expect((await issueOf(p.id, 1)).prUrl).toBe(PR_URL);
		expect((await issueOf(p.id, 2)).status).toBe("done");
		expect((await issueOf(p.id, 3)).status).toBe("in_progress");
	});
});

describe("opened pull requests", () => {
	it("link the referenced issue and move it to In review", async () => {
		const { project: p, secret } = await setup();
		await createIssue(p.id, { status: "todo" });
		await createIssue(p.id, { status: "backlog" });
		const result = await deliver(
			p.id,
			secret,
			pullRequest({
				action: "opened",
				merged: false,
				body: "Tattle #1 Tattle #2",
			}),
		);
		expect(result.body.issues).toEqual([1, 2]);
		const first = await issueOf(p.id, 1);
		expect(first).toMatchObject({ status: "in_review", prUrl: PR_URL });
		// Only issues being worked on move; the backlog one is just linked.
		const second = await issueOf(p.id, 2);
		expect(second).toMatchObject({ status: "backlog", prUrl: PR_URL });
	});

	it("link a draft without moving it, until it is ready for review", async () => {
		const { project: p, secret } = await setup();
		await createIssue(p.id, { status: "in_progress" });
		const draft = { merged: false, draft: true, body: "WIP for Tattle #1" };
		await deliver(p.id, secret, pullRequest({ ...draft, action: "opened" }));
		expect(await issueOf(p.id, 1)).toMatchObject({
			status: "in_progress",
			prUrl: PR_URL,
		});
		await deliver(
			p.id,
			secret,
			pullRequest({ ...draft, draft: false, action: "ready_for_review" }),
		);
		expect((await issueOf(p.id, 1)).status).toBe("in_review");
	});

	it("leave an issue that already has another pull request", async () => {
		const { project: p, secret } = await setup();
		const other = "https://github.com/acme/shop/pull/1";
		await createIssue(p.id, { status: "todo", prUrl: other });
		const result = await deliver(
			p.id,
			secret,
			pullRequest({ action: "opened", merged: false, body: "Tattle #1" }),
		);
		expect(result.body.issues).toEqual([]);
		expect(await issueOf(p.id, 1)).toMatchObject({
			status: "todo",
			prUrl: other,
		});
	});
});
