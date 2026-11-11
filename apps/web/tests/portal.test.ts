import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "#/db";
import { issue, issueVote } from "#/db/schema";
import type { IssueStatus } from "#/server/Issues";
import { Issues } from "#/server/Issues";
import { Portal } from "#/server/Portal";
import { createWorkspace, userActor } from "./helpers/factories";
import { run, runFailure, setupTestDatabase } from "./helpers/runtime";

setupTestDatabase();

const SLUG = "acme-ideas";

const setup = async (portalEnabled = true) => {
	const { project: p } = await createWorkspace({
		portalEnabled,
		portalSlug: SLUG,
	});
	const create = (
		title: string,
		type: "bug" | "feature",
		status: IssueStatus,
	) =>
		run(
			Issues.use((issues) =>
				issues.create(p.id, { type, title, status }, userActor),
			),
		);
	return { p, create };
};

const getPortal = (voterKey: string | null = null) =>
	run(Portal.use((portal) => portal.get(SLUG, voterKey)));
const toggle = (number: number, voterKey: string) =>
	Portal.use((portal) => portal.toggleVote(SLUG, number, voterKey));

describe("Portal.get", () => {
	it("shows accepted feature requests only", async () => {
		const { p, create } = await setup();
		await create("Dark mode", "feature", "backlog");
		await create("Shipped thing", "feature", "done");
		await create("Raw idea", "feature", "triage");
		await create("Declined idea", "feature", "canceled");
		await create("A bug", "bug", "todo");
		await create("Copy of dark mode", "feature", "triage");
		await run(
			Issues.use((issues) => issues.markDuplicate(p.id, 6, 1, userActor)),
		);

		const page = await getPortal();
		expect(page.project).toEqual({ name: p.name, slug: SLUG });
		expect(page.requests.map((r) => r.title).sort()).toEqual([
			"Dark mode",
			"Shipped thing",
		]);
	});

	it("is NotFound when the portal is disabled or unknown", async () => {
		await setup(false);
		expect(
			(await runFailure(Portal.use((portal) => portal.get(SLUG, null))))._tag,
		).toBe("NotFound");
		expect(
			(await runFailure(Portal.use((portal) => portal.get("nope", null))))._tag,
		).toBe("NotFound");
	});
});

describe("Portal.toggleVote", () => {
	it("adds a vote, then removes it, and keeps vote_count in sync", async () => {
		const { create } = await setup();
		const request = await create("Dark mode", "feature", "todo");

		expect(await run(toggle(1, "visitor-a"))).toEqual({
			voted: true,
			demand: 1,
		});
		expect(await run(toggle(1, "visitor-b"))).toEqual({
			voted: true,
			demand: 2,
		});
		const [row] = await db.select().from(issue).where(eq(issue.id, request.id));
		expect(row?.voteCount).toBe(2);

		const page = await getPortal("visitor-a");
		expect(page.requests[0]).toMatchObject({
			number: 1,
			demand: 2,
			voted: true,
		});
		expect((await getPortal("visitor-c")).requests[0]?.voted).toBe(false);

		expect(await run(toggle(1, "visitor-a"))).toEqual({
			voted: false,
			demand: 1,
		});
		const [after] = await db
			.select()
			.from(issue)
			.where(eq(issue.id, request.id));
		expect(after?.voteCount).toBe(1);
	});

	it("refuses votes on shipped requests", async () => {
		const { create } = await setup();
		await create("Shipped", "feature", "done");
		const error = await runFailure(toggle(1, "visitor-a"));
		expect(error).toMatchObject({ _tag: "InvalidInput" });
	});

	it("refuses votes on requests that are not public", async () => {
		const { create } = await setup();
		await create("Raw idea", "feature", "triage");
		await create("A bug", "bug", "todo");
		expect((await runFailure(toggle(1, "visitor-a")))._tag).toBe("NotFound");
		expect((await runFailure(toggle(2, "visitor-a")))._tag).toBe("NotFound");
	});
});

describe("Portal.setVoteEmail", () => {
	it("stores a normalized email on the visitor's vote", async () => {
		const { create } = await setup();
		await create("Dark mode", "feature", "todo");
		await run(toggle(1, "visitor-a"));
		await run(
			Portal.use((portal) =>
				portal.setVoteEmail(SLUG, 1, "visitor-a", "  Jo@Example.COM "),
			),
		);
		const votes = await db.select().from(issueVote);
		expect(votes).toMatchObject([
			{ voterKey: "visitor-a", email: "jo@example.com" },
		]);
	});
});

describe("Portal.suggest", () => {
	it("creates a triage feature request with the author's vote", async () => {
		const { p } = await setup();
		const result = await run(
			Portal.use((portal) =>
				portal.suggest(
					SLUG,
					{
						title: "Export to CSV",
						description: "For accounting",
						email: "Jo@example.com",
					},
					"visitor-a",
				),
			),
		);
		expect(result).toEqual({ number: 1 });
		const [row] = await db
			.select()
			.from(issue)
			.where(eq(issue.projectId, p.id));
		expect(row).toMatchObject({
			type: "feature",
			status: "triage",
			title: "Export to CSV",
			description: "For accounting",
			voteCount: 1,
		});
		expect(await db.select().from(issueVote)).toMatchObject([
			{ issueId: row?.id, voterKey: "visitor-a", email: "jo@example.com" },
		]);
		// Not public until someone accepts it.
		expect((await getPortal()).requests).toEqual([]);
	});

	it("refuses an empty title and a disabled portal", async () => {
		await setup();
		const empty = await runFailure(
			Portal.use((portal) =>
				portal.suggest(SLUG, { title: "  " }, "visitor-a"),
			),
		);
		expect(empty._tag).toBe("InvalidInput");
		const unknown = await runFailure(
			Portal.use((portal) =>
				portal.suggest("nope", { title: "Idea" }, "visitor-a"),
			),
		);
		expect(unknown._tag).toBe("NotFound");
	});
});
