/**
 * The journey Tattle exists for: someone on the customer's website hits a
 * bug and reports it from the widget, with an annotated screenshot, the
 * console and the network attached; the team finds it in Triage, accepts
 * it, comments internally and replies; the reporter reads the reply in the
 * widget (and by email) and answers back.
 */
import { expect, test } from "./support/fixtures.ts";
import { waitForEmail } from "./support/mailpit.ts";
import { unique } from "./support/seed.ts";

test("a bug reported from the widget is triaged, discussed and answered back to the reporter", async ({
	workspace,
	dashboard,
	openSite,
	a11y,
}) => {
	const { project } = workspace;
	const reporter = {
		name: "Rita",
		email: `${unique("rita")}@example.test`,
	};
	const message = `Payment fails at checkout ${unique("bug")}`;
	const site = await openSite({ publicKey: project.publicKey, ...reporter });
	const widget = site.getByRole("dialog", { name: "Send feedback" });

	await test.step("the reporter hits a failing payment on the website", async () => {
		await site.getByRole("button", { name: "Load cart" }).click();
		await expect(site.getByRole("status")).toHaveText("Cart loaded");
		await site.getByRole("button", { name: "Pay now" }).click();
		await expect(site.getByRole("status")).toHaveText("Payment failed");
	});

	await test.step("they report it with an annotated screenshot", async () => {
		await site.getByRole("button", { name: "Send feedback" }).click();
		await expect(widget).toBeVisible();
		await expect(
			widget.getByRole("button", { name: "Report a bug" }),
		).toHaveAttribute("aria-pressed", "true");
		await a11y(site, "widget form", { include: "[data-tattle-widget]" });

		await widget.getByRole("button", { name: "Capture the screen" }).click();
		const editor = site.getByRole("dialog", { name: "Annotate screenshot" });
		await expect(editor).toBeVisible();
		const canvas = editor.getByRole("img", { name: "Annotate screenshot" });
		const box = await canvas.boundingBox();
		if (!box) throw new Error("The screenshot editor has no size");
		await site.mouse.move(box.x + 30, box.y + 30);
		await site.mouse.down();
		await site.mouse.move(box.x + 160, box.y + 90, { steps: 4 });
		await site.mouse.up();
		await expect(editor.getByRole("button", { name: "Undo" })).toBeEnabled();
		await editor.getByRole("button", { name: "Done" }).click();
		await expect(
			widget.getByRole("img", { name: "Annotated screenshot" }),
		).toBeVisible();

		await widget
			.getByRole("textbox", { name: "What went wrong?" })
			.fill(message);
		await widget.getByRole("button", { name: "Send" }).click();
		await expect(widget.getByText("Thanks! We got it.")).toBeVisible();
	});

	await test.step("the report waits in Triage with its evidence", async () => {
		await dashboard.goto(`/p/${project.id}/triage`);
		const list = dashboard.getByRole("region", {
			name: "Reports waiting for a decision",
		});
		const item = list.getByRole("link", { name: new RegExp(message) });
		await expect(item).toBeVisible();
		await expect(
			item.getByRole("img", { name: "Has a screenshot" }),
		).toBeVisible();
		await expect(item).toContainText("1 error · 1 failed");

		await item.click();
		const selected = dashboard.getByRole("region", { name: "Selected report" });
		await expect(
			selected.getByRole("heading", { name: message }),
		).toBeVisible();
		await expect(
			selected.getByRole("img", {
				name: "Annotated screenshot sent with the report",
			}),
		).toBeVisible();

		const logs = selected.getByRole("region", { name: "Logs and context" });
		await expect(
			logs.getByRole("list", { name: "Steps before the report" }),
		).toContainText("button “Pay now” #pay");
		await logs.getByRole("tab", { name: /^Console/ }).click();
		await expect(logs.getByRole("tabpanel")).toContainText(
			"Payment failed with status 500",
		);
		await logs.getByRole("tab", { name: /^Network/ }).click();
		await expect(logs.getByRole("tabpanel")).toContainText("/api/broken");
		await expect(logs.getByRole("tabpanel")).toContainText("500");

		const decision = selected.getByRole("complementary", { name: "Decision" });
		await expect(decision).toContainText(reporter.email);
		await expect(decision).toContainText("1.4.2");
		await a11y(dashboard, "triage");
	});

	await test.step("the team accepts it into the backlog", async () => {
		await dashboard
			.getByRole("region", { name: "Selected report" })
			.getByRole("button", { name: /^Accept/ })
			.click();
		await expect(dashboard.getByText("#1 accepted into Backlog")).toBeVisible();
		await expect(
			dashboard.getByRole("region", { name: "Reports waiting for a decision" }),
		).not.toContainText(message);
	});

	await test.step("on the issue, they comment internally and reply to the reporter", async () => {
		await dashboard.goto(`/p/${project.id}/issues/1`);
		await expect(dashboard.getByRole("textbox", { name: "Title" })).toHaveValue(
			message,
		);
		const properties = dashboard.getByRole("complementary", {
			name: "Issue properties",
		});
		await expect(
			properties.getByRole("button", { name: /Backlog/ }),
		).toBeVisible();

		const comment = "Card declined comes from the payment sandbox, checking.";
		const activity = dashboard.getByRole("region", { name: "Activity" });
		await activity.getByRole("textbox", { name: "Comment" }).fill(comment);
		await activity.getByRole("button", { name: /^Comment/ }).click();
		await expect(activity.getByRole("list")).toContainText(comment);

		const conversation = dashboard.getByRole("region", {
			name: "Conversation with Rita",
		});
		await conversation
			.getByRole("textbox", { name: "Reply to Rita" })
			.fill("Thanks Rita, we found it. A fix ships tomorrow.");
		await conversation
			.getByRole("button", { name: "Reply to reporter" })
			.click();
		await expect(conversation).toContainText(
			"Thanks Rita, we found it. A fix ships tomorrow.",
		);
		await a11y(dashboard, "issue page");
	});

	await test.step("the reply reaches the reporter by email", async () => {
		const email = await waitForEmail(reporter.email, /./);
		expect(email.text).toContain("Thanks Rita, we found it.");
		// Internal comments never leave the team.
		expect(email.text).not.toContain("payment sandbox");
	});

	await test.step("the reporter reads the reply in the widget and answers", async () => {
		await site.reload();
		const launcher = site.getByRole("button", {
			name: /Send feedback · New replies from the team: 1/,
		});
		await expect(launcher).toBeVisible();
		await launcher.click();
		const inbox = site.getByRole("dialog", { name: "My reports" });
		await expect(inbox).toBeVisible();
		await inbox.getByRole("button", { name: new RegExp(message) }).click();
		await expect(inbox).toContainText(
			"Thanks Rita, we found it. A fix ships tomorrow.",
		);
		await expect(inbox).not.toContainText("payment sandbox");
		await a11y(site, "widget conversation", {
			include: "[data-tattle-widget]",
		});

		await inbox
			.getByRole("textbox", { name: "Your reply" })
			.fill("Great, thank you!");
		await inbox.getByRole("button", { name: "Send" }).click();
		await expect(inbox).toContainText("Great, thank you!");
	});

	await test.step("the team sees the reporter's answer on the issue", async () => {
		await dashboard.reload();
		await expect(
			dashboard.getByRole("region", { name: "Conversation with Rita" }),
		).toContainText("Great, thank you!");
	});
});
