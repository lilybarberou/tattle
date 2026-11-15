/**
 * GitHub sync, without GitHub: the test plays GitHub and sends the signed
 * pull_request deliveries GitHub would send to /api/v1/github/<project>.
 * Opening a pull request that says "Fixes Tattle #N" moves the issue to In
 * review; merging it into the default branch moves it to Done.
 */
import { createHmac } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { expect, sendReport, test } from "./support/fixtures.ts";

const deliver = (
	request: APIRequestContext,
	projectId: string,
	secret: string,
	payload: object,
) => {
	const body = JSON.stringify(payload);
	return request.post(`/api/v1/github/${projectId}`, {
		headers: {
			"content-type": "application/json",
			"x-github-event": "pull_request",
			"x-github-delivery": crypto.randomUUID(),
			"x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
		},
		data: body,
	});
};

const pullRequest = (action: string, number: number, merged = false) => ({
	action,
	pull_request: {
		number: 42,
		html_url: "https://github.com/acme/shop/pull/42",
		title: "Round VAT per line",
		body: `Fixes Tattle #${number}`,
		merged,
		draft: false,
		base: { ref: "main" },
		// Opened by someone with access to the repository.
		author_association: "MEMBER",
	},
	repository: { default_branch: "main" },
});

test("a pull request that fixes an issue moves it to In review, then Done when merged", async ({
	workspace,
	dashboard,
	request,
}) => {
	const { project } = workspace;
	const report = await sendReport(request, project.publicKey, {
		message: "VAT rounding is off by one cent",
	});
	await dashboard.goto(`/p/${project.id}/triage`);
	await dashboard
		.getByRole("region", { name: "Selected report" })
		.getByRole("button", { name: /^Accept/ })
		.click();
	await expect(dashboard.getByText(/accepted into Backlog/)).toBeVisible();

	await dashboard.goto(`/p/${project.id}/issues/${report.issueNumber}`);
	const properties = dashboard.getByRole("complementary", {
		name: "Issue properties",
	});
	await properties.getByRole("button", { name: /Backlog/ }).click();
	await dashboard.getByRole("option", { name: /^Todo/ }).click();
	await expect(properties.getByRole("button", { name: /Todo/ })).toBeVisible();

	await dashboard.goto(`/p/${project.id}/settings`);
	const github = dashboard.getByRole("region", { name: "GitHub" });
	const sync = github.getByRole("checkbox", {
		name: "Move issues to Done when their pull request is merged",
	});
	await sync.click();
	await expect(sync).toBeChecked();
	const secret =
		(
			await github
				.getByText(/^[0-9a-f]{64}$/)
				.first()
				.textContent()
		)?.trim() ?? "";
	expect(secret).toHaveLength(64);

	await test.step("a delivery with a wrong signature is refused", async () => {
		const forged = await deliver(
			request,
			project.id,
			"not-the-secret",
			pullRequest("closed", report.issueNumber, true),
		);
		expect(forged.status()).toBe(401);
	});

	await test.step("opening the pull request links it and moves the issue to In review", async () => {
		const opened = await deliver(
			request,
			project.id,
			secret,
			pullRequest("opened", report.issueNumber),
		);
		expect(opened.status(), await opened.text()).toBe(200);
		await dashboard.goto(`/p/${project.id}/issues/${report.issueNumber}`);
		await expect(
			properties.getByRole("button", { name: /In review/ }),
		).toBeVisible();
		await expect(
			properties.getByRole("link", { name: /acme\/shop\/pull\/42/ }),
		).toHaveAttribute("href", "https://github.com/acme/shop/pull/42");
	});

	await test.step("merging it into the default branch moves the issue to Done", async () => {
		const merged = await deliver(
			request,
			project.id,
			secret,
			pullRequest("closed", report.issueNumber, true),
		);
		expect(merged.status(), await merged.text()).toBe(200);
		await dashboard.reload();
		await expect(
			properties.getByRole("button", { name: /Done/ }),
		).toBeVisible();
		await expect(
			dashboard.getByRole("region", { name: "Activity" }),
		).toContainText("GitHub");
	});
});
