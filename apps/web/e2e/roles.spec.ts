/**
 * What each role may do. Members triage like everyone else; owners and
 * admins also hold the secrets (webhooks, identity), the integrations,
 * personal data requests, project settings and deletions. The screens do
 * not offer members what the server refuses them (fns-access.test.ts).
 */
import { expect, sendReport, test } from "./support/fixtures.ts";
import { addMember, seedUser } from "./support/seed.ts";

test("a member triages but cannot touch secrets, integrations or deletions", async ({
	workspace,
	signedInPage,
	request,
	a11y,
}) => {
	const { project, organization } = workspace;
	const member = await seedUser("Mia");
	await addMember(organization.id, member.id, "member");
	const page = await signedInPage(member);
	await sendReport(request, project.publicKey, {
		message: "Coupon field rejects lowercase codes",
		reporter: { email: "carla@example.test", name: "Carla" },
	});

	await test.step("they triage like everyone else", async () => {
		await page.goto(`/p/${project.id}/triage`);
		await page
			.getByRole("region", { name: "Selected report" })
			.getByRole("button", { name: /^Accept/ })
			.click();
		await expect(page.getByText("#1 accepted into Backlog")).toBeVisible();
	});

	await test.step("project settings keep the admin-only parts read-only", async () => {
		await page.goto(`/p/${project.id}/settings`);
		const identity = page.getByRole("region", { name: "Verified identity" });
		await expect(identity).toContainText(
			"Only owners and admins can see the secret or change this.",
		);
		await expect(
			identity.getByRole("button", { name: "Turn on verified identity" }),
		).toHaveCount(0);
		await expect(
			page.getByRole("region", { name: "Discord and Slack" }),
		).toContainText("Only owners and admins can add or remove channels.");
		const webhooks = page.getByRole("region", { name: "Webhooks" });
		await expect(webhooks).toContainText("Only owners and admins can");
		await expect(
			webhooks.getByRole("button", { name: "Add webhook" }),
		).toHaveCount(0);
		const github = page.getByRole("region", { name: "GitHub" });
		await expect(github).toContainText(
			"Only owners and admins can change this.",
		);
		await expect(github.getByRole("checkbox")).toBeDisabled();
		// The name, allowed sites and public page are project settings too.
		for (const name of [
			"General",
			"Allowed sites",
			"Public feature requests",
		]) {
			const section = page.getByRole("region", { name });
			await expect(section).toContainText(
				"Only owners and admins can change this.",
			);
			await expect(section.getByRole("button", { name: /^Save/ })).toHaveCount(
				0,
			);
		}
		await expect(
			page.getByRole("region", { name: "Allowed sites" }).getByRole("textbox"),
		).toHaveAttribute("readonly");
		await expect(
			page.getByRole("region", { name: "Delete this project" }),
		).toHaveCount(0);
		await a11y(page, "project settings (member)");
	});

	await test.step("deleting an issue or a report is not offered", async () => {
		await page.goto(`/p/${project.id}/issues/1`);
		await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(
			"Coupon field rejects lowercase codes",
		);
		// The first report is open: its delete button would be in view.
		await expect(
			page
				.getByRole("region", { name: /Reports/ })
				.getByText("Carla")
				.first(),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Delete issue…" }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Delete report" }),
		).toHaveCount(0);
	});

	await test.step("the duplicate-suggestion AI key is admin-only", async () => {
		await page.goto("/agents");
		await expect(
			page.getByText("Only owners and admins can change it."),
		).toBeVisible();
	});

	await test.step("exporting or erasing someone's data is not offered", async () => {
		await page.goto("/privacy");
		await page.getByLabel("Email or user id").fill("carla@example.test");
		await page.getByRole("button", { name: "Find" }).click();
		await expect(page.getByText(/carla@example\.test: 1 report/)).toBeVisible();
		await expect(
			page.getByText("Only owners and admins can export or erase"),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Download as JSON" }),
		).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Erase…" })).toHaveCount(0);
	});
});

test("an admin who is not the owner manages secrets and integrations", async ({
	workspace,
	signedInPage,
}) => {
	const { project, organization } = workspace;
	const admin = await seedUser("Adam");
	await addMember(organization.id, admin.id, "admin");
	const page = await signedInPage(admin);
	await page.goto(`/p/${project.id}/settings`);

	const identity = page.getByRole("region", { name: "Verified identity" });
	await identity
		.getByRole("button", { name: "Turn on verified identity" })
		.click();
	await expect(
		page.getByText(
			"Verified identity is on. Add the signature on your server.",
		),
	).toBeVisible();
	await expect(
		identity.getByRole("button", { name: "Replace the secret" }),
	).toBeVisible();

	const github = page.getByRole("region", { name: "GitHub" });
	// Saved at once: the box follows the server's answer.
	const sync = github.getByRole("checkbox", {
		name: "Move issues to Done when their pull request is merged",
	});
	await sync.click();
	await expect(sync).toBeChecked();
	await expect(github).toContainText(`/api/v1/github/${project.id}`);
});
