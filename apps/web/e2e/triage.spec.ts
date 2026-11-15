/**
 * The decisions Triage is for: accept a report into the backlog, decline
 * one, and merge a duplicate into the issue it repeats, from the buttons
 * and from the keyboard shortcuts.
 */
import { expect, sendReport, test } from "./support/fixtures.ts";

test("triage accepts, declines and merges duplicates", async ({
	workspace,
	dashboard,
	request,
	a11y,
}) => {
	const { project } = workspace;
	const original = await sendReport(request, project.publicKey, {
		message: "Export to CSV crashes with large files",
		reporter: { email: "first@example.test", name: "First" },
	});
	const declined = await sendReport(request, project.publicKey, {
		message: "asdf test test",
	});
	const accepted = await sendReport(request, project.publicKey, {
		message: "Search ignores accented letters",
	});
	const duplicate = await sendReport(request, project.publicKey, {
		message: "CSV export crashes when the file is large",
		reporter: { email: "second@example.test", name: "Second" },
	});

	const queue = dashboard.getByRole("region", {
		name: "Reports waiting for a decision",
	});
	// The reports still waiting; decided ones move under "Recently decided".
	const pending = queue.getByRole("list").first();
	const recent = queue.getByRole("region", { name: "Recently decided" });
	const selected = dashboard.getByRole("region", { name: "Selected report" });
	const pick = async (title: string) => {
		await pending.getByRole("link", { name: new RegExp(title) }).click();
		await expect(selected.getByRole("heading", { name: title })).toBeVisible();
	};

	await dashboard.goto(`/p/${project.id}/triage`);
	await expect(queue.getByRole("heading", { name: /^Triage/ })).toContainText(
		"4",
	);

	await test.step("decline a report that is not actionable", async () => {
		await pick("asdf test test");
		await selected.getByRole("button", { name: /^Decline/ }).click();
		await expect(
			dashboard.getByText(`#${declined.issueNumber} declined`),
		).toBeVisible();
		await expect(pending).not.toContainText("asdf test test");
		await expect(recent).toContainText("asdf test test");
	});

	await test.step("accept one from the keyboard (A)", async () => {
		await pick("Search ignores accented letters");
		await dashboard.keyboard.press("a");
		await expect(
			dashboard.getByText(`#${accepted.issueNumber} accepted into Backlog`),
		).toBeVisible();
		await expect(pending).not.toContainText("Search ignores accented letters");
		await expect(recent).toContainText("Search ignores accented letters");
	});

	await test.step("merge a duplicate into the issue it repeats", async () => {
		await pick("CSV export crashes when the file is large");
		await selected
			.getByRole("button", { name: "Merge M", exact: true })
			.click();
		const dialog = dashboard.getByRole("dialog", {
			name: `Merge #${duplicate.issueNumber} into…`,
		});
		await expect(dialog).toBeVisible();
		await a11y(dashboard, "merge dialog");
		await dialog
			.getByRole("option", { name: /Export to CSV crashes with large files/ })
			.click();
		await expect(dialog).toBeHidden();
		await expect(pending).not.toContainText(
			"CSV export crashes when the file is large",
		);
	});

	await test.step("the original carries both reports; the others keep their status", async () => {
		await dashboard.goto(`/p/${project.id}/issues/${original.issueNumber}`);
		await expect(
			dashboard.getByRole("region", { name: /^Reports 2/ }),
		).toBeVisible();
		const properties = dashboard.getByRole("complementary", {
			name: "Issue properties",
		});
		await expect(properties).toContainText("2 people");
		await expect(
			dashboard.getByRole("region", { name: "Activity" }),
		).toContainText(`#${duplicate.issueNumber}`);

		await dashboard.goto(`/p/${project.id}/issues/${duplicate.issueNumber}`);
		await expect(
			dashboard
				.getByRole("complementary", { name: "Issue properties" })
				.getByRole("button", { name: /Duplicate/ })
				.first(),
		).toBeVisible();

		await dashboard.goto(`/p/${project.id}/issues/${declined.issueNumber}`);
		await expect(
			dashboard
				.getByRole("complementary", { name: "Issue properties" })
				.getByRole("button", { name: /Canceled|Declined/ }),
		).toBeVisible();

		await dashboard.goto(`/p/${project.id}/issues/${accepted.issueNumber}`);
		await expect(
			dashboard
				.getByRole("complementary", { name: "Issue properties" })
				.getByRole("button", { name: /Backlog/ }),
		).toBeVisible();
	});

	await test.step("the issue list shows each decision", async () => {
		await dashboard.goto(`/p/${project.id}/issues`);
		await expect(dashboard.getByRole("main")).toContainText(
			"Search ignores accented letters",
		);
		await a11y(dashboard, "issue list");
		await dashboard.goto(`/p/${project.id}/overview`);
		await expect(dashboard.getByRole("main")).toBeVisible();
		await a11y(dashboard, "overview");
	});

	await test.step("Triage is now empty except the original", async () => {
		await dashboard.goto(`/p/${project.id}/triage`);
		await expect(pending.getByRole("listitem")).toHaveCount(1);
		await expect(pending).toContainText(
			"Export to CSV crashes with large files",
		);
	});
});
