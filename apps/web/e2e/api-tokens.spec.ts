/**
 * API tokens, the way agents and scripts connect (MCP over HTTP with a
 * Bearer token): created in "Agents & API", shown once, read-only or not,
 * limited to their organization, and dead once revoked.
 */
import type { Page } from "@playwright/test";
import { expect, sendReport, test } from "./support/fixtures.ts";
import { callTool } from "./support/mcp.ts";
import { seedWorkspace } from "./support/seed.ts";

async function createToken(page: Page, name: string, canWrite: boolean) {
	await page.goto("/agents");
	const agents = page.getByRole("region", { name: "Agents" });
	await agents.getByLabel("New agent").fill(name);
	const write = agents.getByRole("checkbox", {
		name: "Can change issues (otherwise read only)",
	});
	if ((await write.isChecked()) !== canWrite) await write.click();
	await expect(write).toBeChecked({ checked: canWrite });
	await agents.getByRole("button", { name: "Create token" }).click();
	await expect(agents.getByText("Copy this token now.")).toBeVisible();
	const token = (await agents.getByText(/^tat_[\w-]+$/).textContent())?.trim();
	if (!token) throw new Error("No token shown");
	await expect(
		agents.getByRole("listitem").filter({ hasText: name }),
	).toContainText(canWrite ? "Reads and changes issues" : "Read only");
	return token;
}

test("a read-only token reads but every write is refused; a write token acts under its name", async ({
	workspace,
	dashboard,
	request,
	a11y,
}) => {
	const { project } = workspace;
	const report = await sendReport(request, project.publicKey, {
		message: "Invoice PDF shows the wrong VAT rate",
		reporter: { email: "vat@example.test", name: "Vera" },
	});
	const reader = await createToken(dashboard, "Reporting script", false);
	await a11y(dashboard, "agents & api");
	const writer = await createToken(dashboard, "Triage bot", true);

	await test.step("the read-only token lists and reads issues", async () => {
		const projects = await callTool(request, reader, "list_projects");
		expect(projects.isError).toBe(false);
		expect(projects.text).toContain(project.id);
		const issue = await callTool(request, reader, "get_issue", {
			project: project.id,
			number: report.issueNumber,
		});
		expect(issue.isError).toBe(false);
		expect(issue.text).toContain("Invoice PDF shows the wrong VAT rate");
	});

	await test.step("the read-only token cannot change anything", async () => {
		const attempts: [string, Record<string, unknown>][] = [
			["update_issue", { project: project.id, number: 1, status: "todo" }],
			["add_comment", { project: project.id, number: 1, body: "hi" }],
			[
				"create_issue",
				{ project: project.id, type: "bug", title: "Made by a reader" },
			],
			[
				"reply_to_reporter",
				{ project: project.id, report_id: report.id, body: "Hello" },
			],
		];
		for (const [tool, args] of attempts) {
			const result = await callTool(request, reader, tool, args);
			expect(result.isError, `${tool} must be refused`).toBe(true);
			expect(result.text).toContain("This API token is read-only");
		}
		await dashboard.goto(`/p/${project.id}/issues/${report.issueNumber}`);
		await expect(
			dashboard
				.getByRole("complementary", { name: "Issue properties" })
				.getByRole("button", { name: /Triage/ }),
		).toBeVisible();
		await dashboard.goto(`/p/${project.id}/issues`);
		await expect(dashboard.getByText("Made by a reader")).toHaveCount(0);
	});

	await test.step("the write token triages, comments and replies as itself", async () => {
		const updated = await callTool(request, writer, "update_issue", {
			project: project.id,
			number: report.issueNumber,
			status: "todo",
			priority: 2,
			assign_to_me: true,
		});
		expect(updated.isError, updated.text).toBe(false);
		const commented = await callTool(request, writer, "add_comment", {
			project: project.id,
			number: report.issueNumber,
			body: "Reproduced: the rate table is cached per region.",
		});
		expect(commented.isError, commented.text).toBe(false);

		await dashboard.goto(`/p/${project.id}/issues/${report.issueNumber}`);
		const properties = dashboard.getByRole("complementary", {
			name: "Issue properties",
		});
		await expect(
			properties.getByRole("button", { name: /Todo/ }),
		).toBeVisible();
		await expect(properties).toContainText("Triage bot");
		const activity = dashboard.getByRole("region", { name: "Activity" });
		await expect(activity).toContainText(
			"Reproduced: the rate table is cached per region.",
		);
		await expect(activity).toContainText("Triage bot");
	});

	await test.step("the token list shows when each was last used", async () => {
		await dashboard.goto("/agents");
		const agents = dashboard.getByRole("region", { name: "Agents" });
		await expect(
			agents.getByRole("listitem").filter({ hasText: "Triage bot" }),
		).toContainText("active");
	});

	await test.step("a revoked token can no longer connect", async () => {
		const agents = dashboard.getByRole("region", { name: "Agents" });
		await agents
			.getByRole("listitem")
			.filter({ hasText: "Reporting script" })
			.getByRole("button", { name: "Revoke" })
			.click();
		await expect(
			dashboard.getByText("Reporting script can no longer connect"),
		).toBeVisible();
		const after = await callTool(request, reader, "list_projects");
		expect(after.status).toBe(401);
	});
});

test("a token never reaches another organization's projects", async ({
	workspace,
	signedInPage,
	request,
}) => {
	const other = await seedWorkspace({ projectName: "Other" });
	await sendReport(request, other.project.publicKey, {
		message: "Secret roadmap item",
	});
	const page = await signedInPage(workspace.owner);
	const token = await createToken(page, "Our bot", true);

	const projects = await callTool(request, token, "list_projects");
	expect(projects.text).toContain(workspace.project.id);
	expect(projects.text).not.toContain(other.project.id);

	const read = await callTool(request, token, "get_issue", {
		project: other.project.id,
		number: 1,
	});
	expect(read.isError).toBe(true);
	expect(read.text).not.toContain("Secret roadmap item");

	const write = await callTool(request, token, "update_issue", {
		project: other.project.id,
		number: 1,
		status: "canceled",
	});
	expect(write.isError).toBe(true);
});

test("the MCP endpoint refuses requests without a valid token", async ({
	request,
}) => {
	const none = await request.post("/api/mcp", {
		headers: { accept: "application/json, text/event-stream" },
		data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
	});
	expect(none.status()).toBe(401);
	expect(none.headers()["www-authenticate"]).toContain("Bearer");
	const forged = await callTool(
		request,
		"tat_forged_token_value",
		"list_projects",
	);
	expect(forged.status).toBe(401);
});
