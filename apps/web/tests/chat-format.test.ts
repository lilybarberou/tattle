import { describe, expect, it } from "vitest";
import { describeEvent, toDiscord, toSlack } from "#/server/chat-format";

const issue = {
	number: 7,
	title: "Checkout button does nothing",
	type: "bug" as const,
	status: "triage",
};

describe("describeEvent", () => {
	it("describes a new report with its evidence", () => {
		const message = describeEvent("report.created", "p1", {
			issue,
			report: {
				message: "Nothing happens when I click",
				pageUrl: "https://shop.example.com/checkout",
				reporter: { email: "jo@example.com" },
				hasScreenshot: true,
				consoleErrors: 2,
				failedRequests: 1,
			},
		});
		expect(message).toEqual({
			title: "Bug #7: Checkout button does nothing",
			url: "http://localhost:3000/p/p1/issues/7",
			text: "Nothing happens when I click",
			color: 0xc4242a,
			fields: [
				["From", "jo@example.com"],
				["Page", "https://shop.example.com/checkout"],
				[
					"Evidence",
					"2 console errors · 1 failed request · screenshot attached",
				],
			],
		});
	});

	it("calls a feature report an idea and an anonymous reporter someone", () => {
		const message = describeEvent("report.created", "p1", {
			issue: { ...issue, type: "feature" },
			report: { message: "Dark mode please", pageUrl: "/" },
		});
		expect(message?.title).toBe("Idea #7: Checkout button does nothing");
		expect(message?.fields).toEqual([
			["From", "Someone"],
			["Page", "/"],
		]);
	});

	it("skips issues opened by the widget (the report already says it)", () => {
		expect(
			describeEvent("issue.created", "p1", {
				issue,
				actor: { type: "system", name: "Widget" },
			}),
		).toBeNull();
		expect(
			describeEvent("issue.created", "p1", {
				issue,
				actor: { type: "user", name: "Ada" },
			})?.text,
		).toBe("Ada opened a bug.");
	});

	it("describes status and assignee changes", () => {
		const message = describeEvent("issue.updated", "p1", {
			issue: { ...issue, prUrl: "https://github.com/o/r/pull/1" },
			changes: {
				status: { from: "todo", to: "in_review" },
				assigneeName: { from: null, to: "Bot" },
			},
			actor: { type: "agent", name: "Bot" },
		});
		expect(message?.text).toBe(
			"Todo → **In review**\nAssigned to **Bot**\nPull request: https://github.com/o/r/pull/1\n— Bot",
		);
	});

	it("describes a merge into another issue", () => {
		const message = describeEvent("issue.updated", "p1", {
			issue,
			changes: { status: { from: "triage", to: "duplicate" } },
			duplicateOf: { ...issue, number: 3, title: "Checkout broken" },
			actor: { type: "user", name: "Ada" },
		});
		expect(message?.text).toBe("Merged into #3 Checkout broken\n— Ada");
	});

	it("uses the done colour when an issue ships", () => {
		const message = describeEvent("issue.updated", "p1", {
			issue,
			changes: { status: { from: "in_review", to: "done" } },
		});
		expect(message?.color).toBe(0x1e7b4f);
	});

	it("ignores updates that are not worth a message", () => {
		expect(
			describeEvent("issue.updated", "p1", {
				issue,
				changes: { labels: { from: [], to: ["ui"] } },
			}),
		).toBeNull();
		expect(
			describeEvent("issue.updated", "p1", {
				issue,
				changes: { title: { from: "a", to: "b" } },
			}),
		).toBeNull();
	});

	it("describes comments and flags agents", () => {
		const message = describeEvent("comment.created", "p1", {
			issue,
			comment: { body: "Fixed in #12", author: { name: "Bot", type: "agent" } },
		});
		expect(message?.title).toBe("Comment on #7 Checkout button does nothing");
		expect(message?.text).toBe("Fixed in #12\n— Bot (agent)");
	});

	it("truncates long text", () => {
		const message = describeEvent("report.created", "p1", {
			issue,
			report: { message: "a".repeat(2000), pageUrl: "/" },
		});
		expect(message?.text).toHaveLength(1500);
		expect(message?.text.endsWith("…")).toBe(true);
	});

	it("has a ping message", () => {
		expect(describeEvent("ping", "p1", undefined)?.title).toBe(
			"Tattle is connected",
		);
	});
});

describe("toDiscord / toSlack", () => {
	const message = {
		title: "#7 Checkout",
		url: "http://localhost:3000/p/p1/issues/7",
		text: "Todo → **Done**",
		color: 0x1e7b4f,
		fields: [["From", "Jo"]] as Array<[string, string]>,
	};

	it("builds a Discord embed", () => {
		expect(toDiscord(message)).toEqual({
			username: "Tattle",
			embeds: [
				{
					title: "#7 Checkout",
					url: message.url,
					description: "Todo → **Done**",
					color: 0x1e7b4f,
					fields: [{ name: "From", value: "Jo", inline: false }],
				},
			],
		});
	});

	it("builds a Slack message with single-asterisk bold", () => {
		expect(toSlack(message)).toEqual({
			text: `<${message.url}|#7 Checkout>\nTodo → *Done*\n*From:* Jo`,
			unfurl_links: false,
		});
		expect(toSlack({ ...message, fields: [] }).text).toBe(
			`<${message.url}|#7 Checkout>\nTodo → *Done*`,
		);
	});

	it("respects Discord's title limit", () => {
		const embed = toDiscord({ ...message, title: "t".repeat(300) })
			.embeds as Array<{
			title: string;
		}>;
		expect(embed[0]?.title).toHaveLength(256);
	});
});
