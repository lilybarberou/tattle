/**
 * A reporter without the widget at hand (a native app, or away from the
 * website) follows the conversation from the email: the reply carries a
 * signed link to read it and answer without an account, and a link to stop
 * emails about that report.
 */
import { APP_URL } from "./config.ts";
import { expect, sendReport, test } from "./support/fixtures.ts";
import { emailsTo, linkIn, waitForEmail } from "./support/mailpit.ts";
import { queryOne, unique } from "./support/seed.ts";

test("the reporter answers from the emailed link, and can stop the emails", async ({
	workspace,
	dashboard,
	request,
	freshPage,
	a11y,
}) => {
	const { project } = workspace;
	const sam = { email: `${unique("sam")}@example.test`, name: "Sam" };
	const report = await sendReport(request, project.publicKey, {
		message: "The app logs me out every five minutes",
		reporter: sam,
	});

	await dashboard.goto(`/p/${project.id}/issues/${report.issueNumber}`);
	const conversation = dashboard.getByRole("region", {
		name: "Conversation with Sam",
	});
	await conversation
		.getByRole("textbox", { name: "Reply to Sam" })
		.fill("Which version of the app do you use?");
	await conversation.getByRole("button", { name: "Reply to reporter" }).click();
	await expect(conversation).toContainText("Which version of the app");

	const email = await waitForEmail(sam.email, /./);
	expect(email.text).toContain("Which version of the app do you use?");
	const threadLink = linkIn(email, `${APP_URL}/thread/`);

	const page = await freshPage();
	await page.goto(threadLink);
	await expect(
		page.getByRole("heading", {
			name: "The app logs me out every five minutes",
		}),
	).toBeVisible();
	await expect(page.getByRole("main")).toContainText(
		"Which version of the app do you use?",
	);
	await a11y(page, "thread link");
	await page.getByLabel("Your reply").fill("Version 3.2 on Android.");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByText("Sent. The team will read it.")).toBeVisible();
	await expect(page.getByRole("main")).toContainText("Version 3.2 on Android.");

	await dashboard.reload();
	await expect(conversation).toContainText("Version 3.2 on Android.");

	// A tampered link opens nothing.
	await page.goto(`${threadLink.slice(0, -4)}abcd`);
	await expect(page.getByRole("main")).not.toContainText(
		"Which version of the app do you use?",
	);

	await test.step("stopping emails about this report", async () => {
		const unsubscribe = linkIn(email, `${APP_URL}/unsubscribe/`);
		await page.goto(unsubscribe);
		// Opening the link changes nothing (link checkers open links too).
		await expect(
			page.getByRole("heading", { name: "Stop emails?" }),
		).toBeVisible();
		await page.getByRole("button", { name: /^Stop/ }).click();
		await expect(
			page.getByRole("heading", {
				name: "You won't get emails about this report",
			}),
		).toBeVisible();
		const stopped = await queryOne<{ emails_stopped_at: Date | null }>(
			"select emails_stopped_at from report where id = $1",
			[report.id],
		);
		expect(stopped?.emails_stopped_at).not.toBeNull();

		const before = (await emailsTo(sam.email)).length;
		await conversation
			.getByRole("textbox", { name: "Reply to Sam" })
			.fill("Thanks, we found the cause.");
		await conversation
			.getByRole("button", { name: "Reply to reporter" })
			.click();
		await expect(conversation).toContainText("Thanks, we found the cause.");
		// The reply is kept for the widget, but no email goes out. Wait for a
		// message that is sent after it (an invitation) before checking.
		const marker = `${unique("marker")}@example.test`;
		await dashboard.goto("/members");
		await dashboard
			.getByRole("region", { name: "Invite someone" })
			.getByLabel("Email")
			.fill(marker);
		await dashboard.getByRole("button", { name: "Create invitation" }).click();
		await waitForEmail(marker, /invited you/);
		expect(await emailsTo(sam.email)).toHaveLength(before);
	});
});
