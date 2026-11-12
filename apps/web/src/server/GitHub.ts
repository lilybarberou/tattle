import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import * as z from "zod";
import { issue, project } from "#/db/schema";
import type { IssueStatus } from "#/shared/issues";
import type { Actor } from "./Access";
import { Database } from "./Database";
import { type DbError, NotFound } from "./errors";
import { type IssuePatch, Issues } from "./Issues";

/** Changes made from GitHub deliveries are recorded under this name. */
export const GITHUB_ACTOR: Actor = { type: "system", id: null, name: "GitHub" };

export const generateGithubSecret = () => randomBytes(32).toString("hex");

/** The `X-Hub-Signature-256` header GitHub sends for this body. */
export const signGithub = (secret: string, body: Uint8Array) =>
	`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

export const verifyGithubSignature = (
	secret: string,
	body: Uint8Array,
	header: string | null,
) => {
	if (!header) return false;
	const expected = Buffer.from(signGithub(secret, body));
	const given = Buffer.from(header);
	return expected.length === given.length && timingSafeEqual(expected, given);
};

// A GitHub closing keyword right before `Tattle #12` (or `tattle#12`), any
// case, with an optional colon: "Fixes Tattle #12", "closes: tattle#12". A
// bare mention, "see Tattle #12" or "does not fix Tattle #12" does not count;
// plain `#12` is GitHub's own issue.
const REFERENCE =
	/(?<!(?:\bnot|\bnever|n['’]t)\s+)\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)(?:\s*:\s*|\s+)tattle\s*#(\d{1,9})\b/gi;

/** Issue numbers a pull request's title or body says it fixes. */
export const issueReferences = (text: string) => [
	...new Set([...text.matchAll(REFERENCE)].map((m) => Number(m[1]))),
];

const pullRequestEvent = z.object({
	action: z.string(),
	pull_request: z.object({
		number: z.number(),
		html_url: z.string(),
		title: z.string(),
		body: z.string().nullish(),
		merged: z.boolean().nullish(),
		draft: z.boolean().nullish(),
		base: z.object({ ref: z.string() }),
	}),
	repository: z.object({ default_branch: z.string() }),
});

export type GithubDelivery = {
	/** The `X-GitHub-Event` header. */
	event: string | null;
	/** The `X-Hub-Signature-256` header. */
	signature: string | null;
	/** The raw request body, exactly as received. */
	body: Uint8Array;
};

export type GithubResponse = {
	status: number;
	body: { ok: boolean; message: string; issues?: number[] };
};

const CLOSED: ReadonlyArray<IssueStatus> = ["done", "canceled", "duplicate"];

export type GithubSettings = {
	enabled: boolean;
	secret: string | null;
	lastDeliveryAt: string | null;
	lastDelivery: string | null;
};

export class GitHub extends Context.Service<
	GitHub,
	{
		/** Handles one webhook delivery for a project; never fails on bad input. */
		readonly receive: (
			projectId: string,
			delivery: GithubDelivery,
		) => Effect.Effect<GithubResponse, DbError>;
		readonly settings: (
			projectId: string,
		) => Effect.Effect<GithubSettings, NotFound | DbError>;
		/** Turns the sync on or off; the first time on creates the secret. */
		readonly setEnabled: (
			projectId: string,
			enabled: boolean,
		) => Effect.Effect<GithubSettings, NotFound | DbError>;
		/** A new secret: GitHub must be given it, the old one stops working. */
		readonly regenerateSecret: (
			projectId: string,
		) => Effect.Effect<GithubSettings, NotFound | DbError>;
	}
>()("tattle/server/GitHub") {
	static readonly layer = Layer.effect(
		GitHub,
		Effect.gen(function* () {
			const database = yield* Database;
			const issues = yield* Issues;

			const settings = Effect.fn("GitHub.settings")(function* (
				projectId: string,
			) {
				const [row] = yield* database.query((db) =>
					db
						.select({
							enabled: project.githubEnabled,
							secret: project.githubSecret,
							lastDeliveryAt: project.githubLastDeliveryAt,
							lastDelivery: project.githubLastDelivery,
						})
						.from(project)
						.where(eq(project.id, projectId)),
				);
				if (!row) return yield* new NotFound({ message: "Project not found" });
				return {
					...row,
					lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
				};
			});

			const setEnabled = Effect.fn("GitHub.setEnabled")(function* (
				projectId: string,
				enabled: boolean,
			) {
				const current = yield* settings(projectId);
				yield* database.query((db) =>
					db
						.update(project)
						.set({
							githubEnabled: enabled,
							githubSecret: current.secret ?? generateGithubSecret(),
						})
						.where(eq(project.id, projectId)),
				);
				return yield* settings(projectId);
			});

			const regenerateSecret = Effect.fn("GitHub.regenerateSecret")(function* (
				projectId: string,
			) {
				yield* settings(projectId);
				yield* database.query((db) =>
					db
						.update(project)
						.set({ githubSecret: generateGithubSecret() })
						.where(eq(project.id, projectId)),
				);
				return yield* settings(projectId);
			});

			const record = (projectId: string, outcome: string) =>
				database
					.query((db) =>
						db
							.update(project)
							.set({
								githubLastDeliveryAt: new Date(),
								githubLastDelivery: outcome,
							})
							.where(eq(project.id, projectId)),
					)
					.pipe(Effect.ignore);

			// Applies one change through Issues.update, the same path as the
			// dashboard: activity, webhooks and the "shipped" email follow.
			const apply = (projectId: string, number: number, patch: IssuePatch) =>
				issues.update(projectId, number, patch, GITHUB_ACTOR).pipe(
					Effect.as([number]),
					Effect.catchTags({
						NotFound: () => Effect.succeed([] as number[]),
						InvalidInput: () => Effect.succeed([] as number[]),
					}),
				);

			const pullRequest = Effect.fn("GitHub.pullRequest")(function* (
				projectId: string,
				event: z.infer<typeof pullRequestEvent>,
			) {
				const pr = event.pull_request;
				const label = `Pull request #${pr.number} ${event.action}`;
				const merged =
					event.action === "closed" &&
					pr.merged === true &&
					pr.base.ref === event.repository.default_branch;
				const opened = ["opened", "reopened", "ready_for_review"].includes(
					event.action,
				);
				if (!merged && !opened) {
					const reason =
						event.action === "closed" && pr.merged
							? `merged into ${pr.base.ref}, not ${event.repository.default_branch}`
							: "nothing to do";
					return { ok: true, message: `${label}: ${reason}`, issues: [] };
				}

				const references = issueReferences(`${pr.title}\n${pr.body ?? ""}`);
				const linked = yield* database.query((db) =>
					db
						.select({
							number: issue.number,
							status: issue.status,
							prUrl: issue.prUrl,
						})
						.from(issue)
						.where(
							and(
								eq(issue.projectId, projectId),
								or(
									eq(issue.prUrl, pr.html_url),
									references.length
										? inArray(issue.number, references)
										: undefined,
								),
							),
						)
						.orderBy(issue.number),
				);

				const changed: number[] = [];
				for (const row of linked) {
					if (CLOSED.includes(row.status)) continue;
					// An issue whose pull request is another one is left alone: a
					// reference neither replaces it nor closes the issue.
					if (row.prUrl && row.prUrl !== pr.html_url) continue;
					if (merged) {
						changed.push(
							...(yield* apply(projectId, row.number, {
								status: "done",
								prUrl: pr.html_url,
							})),
						);
						continue;
					}
					const patch: IssuePatch = {};
					if (!row.prUrl) patch.prUrl = pr.html_url;
					if (
						!pr.draft &&
						(row.status === "todo" || row.status === "in_progress")
					)
						patch.status = "in_review";
					if (Object.keys(patch).length > 0)
						changed.push(...(yield* apply(projectId, row.number, patch)));
				}

				const list = changed.map((n) => `#${n}`).join(", ");
				const message = merged
					? changed.length
						? `${label}: moved ${list} to Done`
						: `${label}: no open linked issue`
					: changed.length
						? `${label}: linked ${list}`
						: `${label}: no issue to link`;
				return { ok: true, message, issues: changed };
			});

			const receive = Effect.fn("GitHub.receive")(function* (
				projectId: string,
				delivery: GithubDelivery,
			) {
				const [row] = yield* database.query((db) =>
					db
						.select({
							id: project.id,
							enabled: project.githubEnabled,
							secret: project.githubSecret,
						})
						.from(project)
						.where(eq(project.id, projectId)),
				);
				// Unknown project, no secret yet or a wrong signature look the same.
				if (
					!row?.secret ||
					!verifyGithubSignature(row.secret, delivery.body, delivery.signature)
				) {
					return {
						status: 401,
						body: { ok: false, message: "Invalid signature" },
					};
				}

				const done = (status: number, body: GithubResponse["body"]) =>
					record(row.id, body.message).pipe(Effect.as({ status, body }));

				if (!row.enabled) {
					return yield* done(202, {
						ok: true,
						message: "Ignored: GitHub sync is turned off for this project",
					});
				}
				if (delivery.event === "ping") {
					return yield* done(200, { ok: true, message: "Ping received" });
				}
				if (delivery.event !== "pull_request") {
					return yield* done(202, {
						ok: true,
						message: `Ignored: ${delivery.event ?? "unknown"} event`,
					});
				}

				let json: unknown;
				try {
					json = JSON.parse(new TextDecoder().decode(delivery.body));
				} catch {
					return yield* done(400, {
						ok: false,
						message:
							"The body is not JSON: set Content type to application/json",
					});
				}
				const parsed = pullRequestEvent.safeParse(json);
				if (!parsed.success) {
					return yield* done(400, {
						ok: false,
						message: "Not a pull_request payload",
					});
				}
				return yield* done(200, yield* pullRequest(row.id, parsed.data));
			});

			return GitHub.of({ receive, settings, setEnabled, regenerateSecret });
		}),
	);
}
