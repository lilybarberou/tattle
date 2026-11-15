/**
 * Personal data and deletion: an access request (export one person's data
 * as JSON), an erasure request (their reports, screenshots, conversations
 * and the issues only they reported go; issues others reported stay), and
 * deleting a report, an issue and a whole project.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { appEnv } from "./config.ts";
import { expect, PNG_DATA_URL, sendReport, test } from "./support/fixtures.ts";
import { queryOne, unique } from "./support/seed.ts";

const screenshotPath = async (reportId: string) => {
	const row = await queryOne<{ screenshot_key: string | null }>(
		"select screenshot_key from report where id = $1",
		[reportId],
	);
	if (!row?.screenshot_key) throw new Error("The report has no screenshot");
	return join(appEnv.STORAGE_DIR, row.screenshot_key);
};

test("an access then an erasure request for one person", async ({
	workspace,
	dashboard,
	request,
	a11y,
}) => {
	const { project } = workspace;
	const lea = { email: `${unique("lea")}@example.test`, name: "Léa" };
	const reporterKey = `key-${unique("device")}-0123456789abcdefghij`;
	const own = await sendReport(request, project.publicKey, {
		message: "My saved address shows someone else's street",
		reporter: lea,
		reporterKey,
		screenshot: PNG_DATA_URL,
	});
	const shared = await sendReport(request, project.publicKey, {
		message: "Checkout total ignores the discount",
		reporter: { email: `${unique("omar")}@example.test`, name: "Omar" },
	});
	const alsoLea = await sendReport(request, project.publicKey, {
		message: "Discount not applied to the total at checkout",
		reporter: lea,
		reporterKey,
	});
	const file = await screenshotPath(own.id);
	expect(existsSync(file)).toBe(true);

	await test.step("Léa's second report joins Omar's issue", async () => {
		await dashboard.goto(`/p/${project.id}/issues/${alsoLea.issueNumber}`);
		await dashboard
			.getByRole("button", { name: /Merge into another issue/ })
			.click();
		await dashboard
			.getByRole("dialog", { name: `Merge #${alsoLea.issueNumber} into…` })
			.getByRole("option", { name: /Checkout total ignores the discount/ })
			.click();
		await expect(
			dashboard.getByText(
				`#${alsoLea.issueNumber} merged into #${shared.issueNumber}`,
			),
		).toBeVisible();
		await dashboard.goto(`/p/${project.id}/issues/${shared.issueNumber}`);
		await expect(
			dashboard.getByRole("region", { name: /^Reports 2/ }),
		).toBeVisible();
	});

	await test.step("the team replies to Léa, so there is a conversation", async () => {
		await dashboard.goto(`/p/${project.id}/issues/${own.issueNumber}`);
		const conversation = dashboard.getByRole("region", {
			name: "Conversation with Léa",
		});
		await conversation
			.getByRole("textbox", { name: "Reply to Léa" })
			.fill("Thanks Léa, we are on it.");
		await conversation
			.getByRole("button", { name: "Reply to reporter" })
			.click();
		await expect(conversation).toContainText("Thanks Léa, we are on it.");
	});

	await test.step("Privacy finds everything about her", async () => {
		await dashboard.goto("/privacy");
		await a11y(dashboard, "privacy");
		await dashboard.getByLabel("Email or user id").fill(lea.email);
		await dashboard.getByRole("button", { name: "Find" }).click();
		await expect(
			dashboard.getByText(`${lea.email}: 2 reports in Shop, 0 votes`),
		).toBeVisible();
	});

	await test.step("the access request downloads her data as JSON", async () => {
		const downloading = dashboard.waitForEvent("download");
		await dashboard.getByRole("button", { name: "Download as JSON" }).click();
		const download = await downloading;
		expect(download.suggestedFilename()).toMatch(/^data-.+\.json$/);
		const exported = await readFile(await download.path(), "utf8");
		expect(exported).toContain("My saved address shows someone else's street");
		expect(exported).toContain("Discount not applied to the total at checkout");
		expect(exported).toContain("Thanks Léa, we are on it.");
		// Only her: Omar's report is not in her export.
		expect(exported).not.toContain("Checkout total ignores the discount");
		expect(() => JSON.parse(exported)).not.toThrow();
	});

	await test.step("the erasure request deletes her data for good", async () => {
		await dashboard.getByRole("button", { name: "Erase…" }).click();
		await expect(
			dashboard.getByText(/issues others also reported stay/),
		).toBeVisible();
		await dashboard
			.getByRole("button", { name: "Erase 2 items for good" })
			.click();
		await expect(
			dashboard.getByText(
				/Erased 2 reports, 1 messages and 0 votes; 1 issues they opened were deleted/,
			),
		).toBeVisible();
		await dashboard.getByRole("button", { name: "Find" }).click();
		await expect(
			dashboard.getByText(`Nothing stored for “${lea.email}”.`),
		).toBeVisible();
	});

	await test.step("her issue, report, screenshot and device follow-up are gone", async () => {
		await dashboard.goto(`/p/${project.id}/issues/${own.issueNumber}`);
		await expect(
			dashboard.getByRole("heading", { name: "This page doesn't exist" }),
		).toBeVisible();
		expect(existsSync(file)).toBe(false);
		const left = await queryOne<{ count: string }>(
			"select count(*) from report where project_id = $1 and reporter->>'email' = $2",
			[project.id, lea.email],
		);
		expect(left?.count).toBe("0");

		const mine = await request.get("/api/v1/my-reports", {
			headers: {
				"x-tattle-project-key": project.publicKey,
				"x-tattle-reporter-key": reporterKey,
			},
		});
		expect(mine.status()).toBe(200);
		expect((await mine.json()).reports).toEqual([]);
	});

	await test.step("the issue Omar reported too stays, with his report only", async () => {
		await dashboard.goto(`/p/${project.id}/issues/${shared.issueNumber}`);
		await expect(
			dashboard.getByRole("region", { name: /^Reports 1/ }),
		).toBeVisible();
		await expect(dashboard.getByRole("main")).not.toContainText(
			"Discount not applied to the total at checkout",
		);
	});
});

test("deleting a report, an issue, then the whole project", async ({
	workspace,
	dashboard,
	request,
}) => {
	const { project } = workspace;
	const first = await sendReport(request, project.publicKey, {
		message: "Map does not load on Safari",
		screenshot: PNG_DATA_URL,
	});
	const second = await sendReport(request, project.publicKey, {
		message: "Map stays blank in Safari",
	});
	const file = await screenshotPath(first.id);

	await test.step("merge, then delete one of the two reports", async () => {
		await dashboard.goto(`/p/${project.id}/issues/${second.issueNumber}`);
		await dashboard
			.getByRole("button", { name: /Merge into another issue/ })
			.click();
		await dashboard
			.getByRole("dialog", { name: `Merge #${second.issueNumber} into…` })
			.getByRole("option", { name: /Map does not load on Safari/ })
			.click();
		await expect(
			dashboard.getByText(
				`#${second.issueNumber} merged into #${first.issueNumber}`,
			),
		).toBeVisible();
		await dashboard.goto(`/p/${project.id}/issues/${first.issueNumber}`);
		const reports = dashboard.getByRole("region", { name: /^Reports 2/ });
		await expect(reports).toBeVisible();
		const article = reports
			.getByRole("article")
			.filter({ hasText: "Map does not load on Safari" });
		// Only the newest report starts open: open this one first.
		const header = article.getByRole("button", { name: / · / });
		if ((await header.getAttribute("aria-expanded")) !== "true")
			await header.click();
		await expect(header).toHaveAttribute("aria-expanded", "true");
		await article.getByRole("button", { name: "Delete report" }).click();
		await article.getByRole("button", { name: "Delete", exact: true }).click();
		await expect(
			dashboard.getByRole("region", { name: /^Reports 1/ }),
		).toBeVisible();
		expect(existsSync(file)).toBe(false);
	});

	await test.step("delete the issue", async () => {
		await dashboard.getByRole("button", { name: "Delete issue…" }).click();
		await dashboard
			.getByRole("complementary", { name: "Issue properties" })
			.getByRole("button", { name: "Delete", exact: true })
			.click();
		await expect(
			dashboard.getByText(`#${first.issueNumber} deleted`),
		).toBeVisible();
		await expect(dashboard).toHaveURL(new RegExp(`/p/${project.id}/issues$`));
	});

	await test.step("delete the project: its widget key stops working", async () => {
		await dashboard.goto(`/p/${project.id}/settings`);
		const danger = dashboard.getByRole("region", {
			name: "Delete this project",
		});
		const button = danger.getByRole("button", {
			name: `Delete ${project.name}`,
		});
		await expect(button).toBeDisabled();
		await danger.getByRole("textbox").fill(project.name);
		await button.click();
		await expect(
			dashboard.getByText(`${project.name} was deleted`),
		).toBeVisible();

		const refused = await request.post("/api/v1/ingest", {
			data: {
				projectKey: project.publicKey,
				type: "bug",
				message: "Still there?",
				pageUrl: "https://shop.example.test",
				device: {},
				console: [],
				network: [],
			},
		});
		expect(refused.status()).toBe(404);
		const left = await queryOne<{ count: string }>(
			"select count(*) from issue where project_id = $1",
			[project.id],
		);
		expect(left?.count).toBe("0");
	});
});
