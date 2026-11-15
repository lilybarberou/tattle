/**
 * The public feature-request page: published from project settings, it
 * shows only requests the team accepted. Visitors vote (once per browser),
 * ask to hear when a request ships, and suggest ideas, which land in
 * Triage. Shipping a request emails those who asked.
 */
import type { Page } from "@playwright/test";
import { expect, sendReport, test } from "./support/fixtures.ts";
import { waitForEmail } from "./support/mailpit.ts";
import { unique } from "./support/seed.ts";

const row = (page: Page, title: string) =>
	page.getByRole("listitem").filter({ hasText: title });
const voteButton = (page: Page, title: string) =>
	row(page, title).getByRole("button", { name: /^Vote, \d+ votes?$/ });

test("visitors vote, subscribe and suggest on the public page; shipping emails them", async ({
	workspace,
	dashboard,
	request,
	freshPage,
	a11y,
}) => {
	const { project } = workspace;
	const slug = unique("shop");
	const darkMode = `Dark mode ${unique("idea")}`;
	const pdf = `Export invoices to PDF ${unique("idea")}`;
	const fan = `${unique("fan")}@example.test`;

	await test.step("two feature requests arrive; the team accepts one", async () => {
		await sendReport(request, project.publicKey, {
			type: "feature",
			message: darkMode,
		});
		await sendReport(request, project.publicKey, {
			type: "feature",
			message: pdf,
		});
		await dashboard.goto(`/p/${project.id}/triage`);
		await dashboard
			.getByRole("region", { name: "Reports waiting for a decision" })
			.getByRole("link", { name: new RegExp(darkMode) })
			.click();
		const selected = dashboard.getByRole("region", { name: "Selected report" });
		await expect(
			selected.getByRole("heading", { name: darkMode }),
		).toBeVisible();
		await selected.getByRole("button", { name: /^Accept/ }).click();
		await expect(dashboard.getByText(/accepted into Backlog/)).toBeVisible();
	});

	await test.step("the team publishes the page", async () => {
		await dashboard.goto(`/p/${project.id}/settings`);
		const portal = dashboard.getByRole("region", {
			name: "Public feature requests",
		});
		await portal.getByRole("checkbox", { name: "Publish the page" }).click();
		await portal.getByLabel("Address").fill(slug);
		await portal.getByRole("button", { name: "Save" }).click();
		await expect(
			portal.getByRole("link", { name: "Open the public page" }),
		).toBeVisible();
	});

	const visitor = await freshPage();
	await test.step("a visitor sees only the accepted request, and votes", async () => {
		await visitor.goto(`/portal/${slug}`);
		await expect(
			visitor.getByRole("heading", { name: "Feature requests" }),
		).toBeVisible();
		await expect(row(visitor, darkMode)).toBeVisible();
		await expect(visitor.getByText(pdf)).toHaveCount(0);
		await a11y(visitor, "public portal");

		const vote = voteButton(visitor, darkMode);
		await expect(vote).toHaveAccessibleName("Vote, 1 vote");
		await expect(vote).toHaveAttribute("aria-pressed", "false");
		await vote.click();
		await expect(vote).toHaveAttribute("aria-pressed", "true");
		await expect(vote).toHaveAccessibleName("Vote, 2 votes");
		await expect(vote).toBeEnabled();
	});

	await test.step("they ask to hear when it ships", async () => {
		await visitor
			.getByLabel(`Get an email when “${darkMode}” ships?`)
			.fill(fan);
		await visitor.getByRole("button", { name: "Notify me" }).click();
		await expect(
			visitor.getByText("We'll email you when it ships"),
		).toBeVisible();
	});

	await test.step("the vote is remembered in that browser only", async () => {
		await visitor.reload();
		await expect(voteButton(visitor, darkMode)).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		const other = await freshPage();
		await other.goto(`/portal/${slug}`);
		const vote = voteButton(other, darkMode);
		await expect(vote).toHaveAccessibleName("Vote, 2 votes");
		await expect(vote).toHaveAttribute("aria-pressed", "false");
		await vote.click();
		await expect(vote).toHaveAccessibleName("Vote, 3 votes");
		// Voting again takes the vote back.
		await vote.click();
		await expect(vote).toHaveAccessibleName("Vote, 2 votes");
		await expect(vote).toHaveAttribute("aria-pressed", "false");
		// Counts move at once; the button is enabled again once the server
		// has answered.
		await expect(vote).toBeEnabled();
	});

	const idea = `Gift cards ${unique("idea")}`;
	await test.step("a suggested idea goes to Triage, not to the page", async () => {
		await visitor.getByRole("button", { name: "Suggest an idea" }).click();
		const dialog = visitor.getByRole("dialog", { name: "Suggest an idea" });
		await dialog.getByLabel("Your idea in one line").fill(idea);
		await dialog.getByRole("button", { name: "Send the idea" }).click();
		await expect(
			visitor.getByText("Thanks! The team will review your idea."),
		).toBeVisible();
		await expect(visitor.getByText(idea)).toHaveCount(0);

		await dashboard.goto(`/p/${project.id}/triage`);
		await expect(
			dashboard
				.getByRole("region", { name: "Reports waiting for a decision" })
				.getByRole("link", { name: new RegExp(idea) }),
		).toBeVisible();
	});

	await test.step("shipping the request emails the subscriber and moves it to Shipped", async () => {
		await dashboard.goto(`/p/${project.id}/issues/1`);
		await expect(dashboard.getByRole("textbox", { name: "Title" })).toHaveValue(
			darkMode,
		);
		await dashboard
			.getByRole("complementary", { name: "Issue properties" })
			.getByRole("button", { name: /Backlog/ })
			.click();
		await dashboard.getByRole("option", { name: /^Done/ }).click();
		await expect(
			dashboard
				.getByRole("complementary", { name: "Issue properties" })
				.getByRole("button", { name: /Done/ }),
		).toBeVisible();

		const email = await waitForEmail(fan, /./);
		expect(`${email.subject}\n${email.text}`).toContain(darkMode);

		await visitor.goto(`/portal/${slug}`);
		await expect(row(visitor, darkMode)).toHaveCount(0);
		await visitor.getByRole("link", { name: /^Shipped/ }).click();
		await expect(row(visitor, darkMode)).toBeVisible();
		await expect(voteButton(visitor, darkMode)).toBeDisabled();
	});

	await test.step("an unpublished page shows nothing", async () => {
		await dashboard.goto(`/p/${project.id}/settings`);
		const portal = dashboard.getByRole("region", {
			name: "Public feature requests",
		});
		await portal.getByRole("checkbox", { name: "Publish the page" }).click();
		await portal.getByRole("button", { name: "Save" }).click();
		await expect(
			portal.getByRole("link", { name: "Open the public page" }),
		).toHaveCount(0);
		await visitor.goto(`/portal/${slug}`);
		await expect(
			visitor.getByRole("heading", { name: "This page isn't published" }),
		).toBeVisible();
	});
});
