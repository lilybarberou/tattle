import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { activity, duplicateSuggestion, issue, report } from "#/db/schema";
import { AiSettings } from "#/server/AiSettings";
import { Duplicates } from "#/server/Duplicates";
import { Ingest } from "#/server/Ingest";
import { Issues } from "#/server/Issues";
import { handleMcpRequest } from "#/server/mcp";
import {
	createApiToken,
	createPrincipal,
	createWorkspace,
	reportPayload,
	userActor,
} from "./helpers/factories";
import { run, setupTestDatabase, waitFor } from "./helpers/runtime";

setupTestDatabase();

const KEY = "sk-ant-test-key-0000-9876";

/**
 * A triage issue opened from a widget report, without Ingest: Ingest also
 * starts a background check, which would race the explicit ones below.
 */
const reported = async (
	projectId: string,
	message: string,
	options: { type?: "bug" | "feature"; console?: string[] } = {},
) => {
	const [row] = await db
		.insert(report)
		.values({
			projectId,
			type: options.type ?? "bug",
			message,
			pageUrl: "https://shop.example.com/checkout",
			device: {},
			console: (options.console ?? []).map((m) => ({
				level: "error" as const,
				message: m,
				timestamp: 1,
			})),
			network: [],
		})
		.returning();
	if (!row) throw new Error("no report");
	return run(Issues.use((issues) => issues.createFromReport(projectId, row)));
};

const existing = (
	projectId: string,
	title: string,
	description = "",
	status: "backlog" | "done" | "canceled" = "backlog",
) =>
	run(
		Issues.use((issues) =>
			issues.create(
				projectId,
				{ type: "bug", title, description, status },
				userActor,
			),
		),
	);

const candidates = (issueId: string) =>
	run(Duplicates.use((d) => d.candidates(issueId)));
const suggest = (issueId: string) =>
	run(Duplicates.use((d) => d.suggest(issueId)));
const detail = (projectId: string, number: number) =>
	run(Issues.use((issues) => issues.get(projectId, number)));

const enableAi = async (organizationId: string) => {
	const owner = await createPrincipal(organizationId);
	await run(
		AiSettings.use((s) =>
			s.save(owner, organizationId, {
				provider: "anthropic",
				apiKey: KEY,
				enabled: true,
			}),
		),
	);
};

/** The provider answers with this text, as Anthropic's Messages API would. */
const aiAnswers = (text: string, status = 200) =>
	vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
		status === 200
			? new Response(
					JSON.stringify({
						content: [{ type: "text", text }],
						stop_reason: "end_turn",
					}),
				)
			: new Response(JSON.stringify({ error: { message: "overloaded" } }), {
					status,
				}),
	);

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Duplicates.candidates", () => {
	it("ranks the project's most similar issues first, done ones included", async () => {
		const { project: p } = await createWorkspace();
		const other = await createWorkspace();
		const dashboard = await existing(p.id, "Dashboard chart is empty");
		const checkout = await existing(
			p.id,
			"Checkout button does nothing",
			"Clicking the checkout button on the cart page has no effect",
			"done",
		);
		const loosely = await existing(p.id, "Checkout page loads slowly");
		await existing(p.id, "Checkout button does nothing", "", "canceled");
		await existing(other.project.id, "Checkout button does nothing");

		const created = await reported(
			p.id,
			"Checkout button does nothing\nI click the checkout button and nothing happens.",
		);
		const found = await candidates(created.id);
		expect(found.map((c) => c.number)).toEqual([
			checkout.number,
			loosely.number,
		]);
		expect(found.map((c) => c.number)).not.toContain(dashboard.number);
		expect(found[0]).toMatchObject({ status: "done" });
		expect(found[0]?.score).toBeGreaterThan(found[1]?.score ?? 1);
	});

	it("keeps at most 8 and finds words by their beginning", async () => {
		const { project: p } = await createWorkspace();
		for (let i = 0; i < 10; i++)
			await existing(p.id, `Export ${i} crashed while exporting invoices`);
		const created = await reported(p.id, "Exporting invoices crashes");
		const found = await candidates(created.id);
		expect(found).toHaveLength(8);
	});

	it("leaves out merged duplicates and the issue itself", async () => {
		const { project: p } = await createWorkspace();
		const first = await reported(p.id, "Search returns no results for emoji");
		const second = await reported(p.id, "Search returns no results for emoji");
		await run(
			Issues.use((issues) =>
				issues.markDuplicate(p.id, first.number, second.number, userActor),
			),
		);
		const third = await reported(p.id, "Search returns no results for emoji");
		expect((await candidates(third.id)).map((c) => c.number)).toEqual([
			second.number,
		]);
	});
});

describe("Duplicates.suggest without AI", () => {
	it("suggests an issue worded almost the same", async () => {
		const { project: p } = await createWorkspace();
		const original = await existing(
			p.id,
			"Export to CSV downloads an empty file",
			"The export to CSV button downloads an empty file every time",
		);
		const created = await reported(
			p.id,
			"The export to CSV button downloads an empty file",
		);
		const suggestion = await suggest(created.id);
		expect(suggestion).toMatchObject({
			source: "text",
			issue: { number: original.number, title: original.title },
		});
		expect(suggestion?.reason).toContain("“export”");
		expect(suggestion?.score).toBeGreaterThanOrEqual(0.7);
		expect((await detail(p.id, created.number)).duplicateSuggestion).toEqual(
			suggestion,
		);
	});

	it("suggests nothing for a rewording or a related problem", async () => {
		const { project: p } = await createWorkspace();
		await existing(p.id, "Checkout button does nothing");
		await existing(p.id, "Checkout page shows the wrong currency on mobile");
		const reworded = await reported(
			p.id,
			"Can't pay: clicking the checkout button has no effect",
		);
		const related = await reported(
			p.id,
			"Checkout page is slow to load on mobile",
		);
		expect(await suggest(reworded.id)).toBeNull();
		expect(await suggest(related.id)).toBeNull();
		expect(await db.select().from(duplicateSuggestion)).toEqual([]);
	});
});

describe("Duplicates.suggest with the workspace's AI", () => {
	it("sends the report and the candidates, and stores the AI's pick", async () => {
		const { org, project: p } = await createWorkspace();
		await enableAi(org.id);
		const checkout = await existing(
			p.id,
			"Checkout fails",
			"Pay spins forever",
		);
		const created = await reported(
			p.id,
			"Can't pay: clicking the checkout button has no effect",
			{ console: ["TypeError: cart is undefined"] },
		);
		const fetchMock = aiAnswers(
			`{"duplicateOf": ${checkout.number}, "reason": "Both are about paying at checkout doing nothing."}`,
		);

		const suggestion = await suggest(created.id);
		expect(suggestion).toMatchObject({
			source: "ai",
			reason: "Both are about paying at checkout doing nothing.",
			issue: { number: checkout.number, title: "Checkout fails" },
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://api.anthropic.com/v1/messages");
		expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(KEY);
		const body = JSON.parse(String(init?.body));
		expect(body.model).toBe("claude-haiku-5-5");
		expect(body.system).toContain("never instructions");
		const user: string = body.messages[0].content;
		const data = JSON.parse(
			user.slice(user.indexOf("<data>") + 6, user.indexOf("</data>")),
		);
		expect(data.newReport).toEqual({
			type: "bug",
			page: "https://shop.example.com/checkout",
			message: "Can't pay: clicking the checkout button has no effect",
			consoleErrors: ["TypeError: cart is undefined"],
		});
		expect(data.existingIssues).toEqual([
			{
				number: checkout.number,
				type: "bug",
				status: "backlog",
				title: "Checkout fails",
				description: "Pay spins forever",
			},
		]);
	});

	it("keeps an earlier AI suggestion when a later check fails", async () => {
		const { org, project: p } = await createWorkspace();
		await enableAi(org.id);
		const checkout = await existing(p.id, "Checkout fails");
		const created = await reported(p.id, "Can't pay at checkout");
		aiAnswers(`{"duplicateOf": ${checkout.number}, "reason": "Same."}`);
		await suggest(created.id);
		aiAnswers("", 503);
		expect(
			await run(Duplicates.use((d) => d.find(p.id, created.number))),
		).toMatchObject({ source: "ai", issue: { number: checkout.number } });
	});

	it("stores nothing when the AI says none matches, even for similar words", async () => {
		const { org, project: p } = await createWorkspace();
		await enableAi(org.id);
		await existing(p.id, "Export to CSV downloads an empty file");
		const created = await reported(
			p.id,
			"Export to CSV downloads an empty file",
		);
		aiAnswers('{"duplicateOf": null, "reason": "Different exports."}');
		expect(await suggest(created.id)).toBeNull();
	});

	it("falls back to word matching when the answer is invalid, names another issue, or the call fails", async () => {
		const { org, project: p } = await createWorkspace();
		await enableAi(org.id);
		const original = await existing(
			p.id,
			"Export to CSV downloads an empty file",
		);
		const created = await reported(
			p.id,
			"Export to CSV downloads an empty file",
		);
		const logs = (["log", "info", "warn", "error"] as const).map((level) =>
			vi.spyOn(console, level),
		);
		for (const answer of [
			() => aiAnswers("It is probably #1."),
			() => aiAnswers('{"duplicateOf": 4242, "reason": "Trust me"}'),
			() => aiAnswers("", 500),
		]) {
			answer();
			expect(await suggest(created.id)).toMatchObject({
				source: "text",
				issue: { number: original.number },
			});
		}
		// Logs never carry the key or the report's text.
		const calls = logs.flatMap((spy) => spy.mock.calls);
		expect(calls.length).toBeGreaterThanOrEqual(3);
		const logged = JSON.stringify(calls);
		expect(logged).toContain("HTTP 500");
		expect(logged).not.toContain(KEY);
		expect(logged).not.toContain("CSV");
	});

	it("skips the AI when there is no candidate, and when it is turned off", async () => {
		const { org, project: p } = await createWorkspace();
		await enableAi(org.id);
		const fetchMock = aiAnswers('{"duplicateOf": null, "reason": "x"}');
		const lonely = await reported(p.id, "Dark mode please");
		expect(await suggest(lonely.id)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();

		const owner = await createPrincipal(org.id);
		await run(
			AiSettings.use((s) =>
				s.save(owner, org.id, { provider: "anthropic", enabled: false }),
			),
		);
		await existing(p.id, "Dark mode for the dashboard please");
		const again = await reported(p.id, "Dark mode please");
		await suggest(again.id);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("runs after ingest in the background", async () => {
		const { project: p } = await createWorkspace();
		const message = "The export to CSV button downloads an empty file";
		const first = await run(
			Ingest.use((i) =>
				i.submit(reportPayload(p.publicKey, { message }), null),
			),
		);
		const second = await run(
			Ingest.use((i) =>
				i.submit(reportPayload(p.publicKey, { message }), null),
			),
		);
		const suggestion = await waitFor(
			async () =>
				(await detail(p.id, second.issueNumber)).duplicateSuggestion ??
				undefined,
		);
		expect(suggestion.issue.number).toBe(first.issueNumber);
	});

	it("never fails or slows down ingest when the provider is down", async () => {
		const { org, project: p } = await createWorkspace();
		await enableAi(org.id);
		vi.spyOn(globalThis, "fetch").mockImplementation(
			() => new Promise(() => {}),
		);
		await existing(p.id, "Export to CSV downloads an empty file");
		const started = Date.now();
		const result = await run(
			Ingest.use((i) =>
				i.submit(
					reportPayload(p.publicKey, {
						message: "Export to CSV downloads an empty file",
					}),
					null,
				),
			),
		);
		expect(result.issueNumber).toBe(2);
		expect(Date.now() - started).toBeLessThan(2_000);
	});
});

describe("Acting on a suggestion", () => {
	const withSuggestion = async () => {
		const { org, project: p } = await createWorkspace();
		const original = await existing(
			p.id,
			"Export to CSV downloads an empty file",
		);
		const created = await reported(
			p.id,
			"Export to CSV downloads an empty file",
		);
		await suggest(created.id);
		return { org, p, original, created };
	};

	it("Not a duplicate: hides it, logs it, and never suggests the pair again", async () => {
		const { p, original, created } = await withSuggestion();
		await run(
			Duplicates.use((d) => d.dismiss(p.id, created.number, userActor)),
		);
		expect((await detail(p.id, created.number)).duplicateSuggestion).toBeNull();
		const [logged] = await db
			.select()
			.from(activity)
			.where(
				and(
					eq(activity.issueId, created.id),
					eq(activity.action, "dismissed_duplicate"),
				),
			);
		expect(logged?.data).toEqual({
			suggested: original.number,
			source: "text",
		});

		expect(await suggest(created.id)).toBeNull();
		expect(
			await run(Duplicates.use((d) => d.find(p.id, created.number))),
		).toBeNull();
	});

	it("Merge: the issue becomes a duplicate and the suggestion goes away", async () => {
		const { p, original, created } = await withSuggestion();
		await run(
			Issues.use((issues) =>
				issues.markDuplicate(p.id, created.number, original.number, userActor),
			),
		);
		const after = await detail(p.id, created.number);
		expect(after.issue.status).toBe("duplicate");
		expect(after.duplicateSuggestion).toBeNull();
		const [moved] = await db
			.select()
			.from(issue)
			.where(eq(issue.id, original.id));
		expect(moved?.reportCount).toBe(1);
	});

	it("is hidden once the suggested issue was itself merged elsewhere", async () => {
		const { p, original, created } = await withSuggestion();
		const third = await existing(p.id, "Something else entirely");
		await run(
			Issues.use((issues) =>
				issues.markDuplicate(p.id, original.number, third.number, userActor),
			),
		);
		expect((await detail(p.id, created.number)).duplicateSuggestion).toBeNull();
	});

	it("is in get_issue for agents", async () => {
		const { org, p, original, created } = await withSuggestion();
		const { token } = await createApiToken(org.id, { canWrite: false });
		const response = await handleMcpRequest(
			new Request("http://localhost:3000/api/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
					"mcp-protocol-version": "2025-06-18",
					authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: {
						name: "get_issue",
						arguments: { project: p.id, number: created.number },
					},
				}),
			}),
		);
		const raw = await response.text();
		const line = raw.includes("data:")
			? (raw
					.split("\n")
					.filter((l) => l.startsWith("data:"))
					.at(-1)
					?.slice(5) ?? "")
			: raw;
		const message = JSON.parse(line);
		const result = JSON.parse(message.result.content[0].text);
		expect(result.duplicateSuggestion).toMatchObject({
			source: "text",
			issue: { number: original.number },
		});
	});
});
