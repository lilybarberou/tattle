/**
 * A fresh server, as its owner meets it: the admin account takes the setup
 * code, onboarding creates the organization and the first project, sign-up
 * closes, and the admin signs out and back in.
 *
 * Runs alone in the "first-run" project, before every other test: it needs
 * a database without any account (start-app.ts recreates it on each run).
 */
import { PASSWORD, SETUP_CODE } from "./config.ts";
import { expect, test } from "./support/fixtures.ts";
import { unique } from "./support/seed.ts";

test("the first account takes the setup code, creates the workspace, and closes sign-up", async ({
	page,
	browser,
	a11y,
}) => {
	const email = `${unique("admin")}@example.test`;

	await test.step("the login page asks for the setup code", async () => {
		await page.goto("/login");
		await expect(
			page.getByRole("heading", { name: "Create the admin account" }),
		).toBeVisible();
		await a11y(page, "login (first account)");
	});

	await test.step("a wrong setup code is refused", async () => {
		await page.getByLabel("Setup code").fill("WRNG-CODE-0000");
		await page.getByLabel("Name").fill("Ada Admin");
		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Password").fill(PASSWORD);
		await page.getByRole("button", { name: "Create account" }).click();
		await expect(page.getByText(/Wrong setup code/)).toBeVisible();
		await expect(page).toHaveURL(/\/login/);
	});

	await test.step("the right code creates the admin account", async () => {
		await page.getByLabel("Setup code").fill(SETUP_CODE.toLowerCase());
		await page.getByRole("button", { name: "Create account" }).click();
		await expect(page).toHaveURL(/\/onboarding/);
		await expect(
			page.getByRole("heading", { name: "Create a project" }),
		).toBeVisible();
		await a11y(page, "onboarding");
	});

	await test.step("onboarding creates the organization and the project", async () => {
		await page.getByLabel("Organization").fill("Atelier Nord");
		await page.getByLabel("Project name").fill("Storefront");
		await page.getByRole("button", { name: "Create project" }).click();
		await expect(page).toHaveURL(/\/p\/[\w-]+\/settings/);
		await expect(
			page.getByRole("heading", { name: "Project settings" }),
		).toBeVisible();
		// The widget snippet carries the project's public key.
		const install = page.getByRole("region", { name: "Install the widget" });
		await expect(install).toContainText(/data-project-key="pk_[0-9a-f]{32}"/);
		await expect(
			page.getByRole("complementary", { name: "Sidebar" }),
		).toContainText("Storefront");
		await a11y(page, "project settings");
	});

	await test.step("sign-up is now closed to strangers", async () => {
		const stranger = await browser.newContext({ baseURL: page.url() });
		const strangerPage = await stranger.newPage();
		await strangerPage.goto("/login");
		await expect(
			strangerPage.getByRole("heading", { name: "Sign in" }),
		).toBeVisible();
		await expect(
			strangerPage.getByText(
				"Accounts are created by invitation. Ask a member of your team.",
			),
		).toBeVisible();
		await expect(
			strangerPage.getByRole("button", { name: "Create one" }),
		).toHaveCount(0);
		await a11y(strangerPage, "login (sign in)");
		await stranger.close();
	});

	await test.step("the admin signs out and back in", async () => {
		await page
			.getByRole("complementary", { name: "Sidebar" })
			.getByRole("button", { name: /Ada Admin/ })
			.click();
		await page.getByRole("menuitem", { name: "Sign out" }).click();
		await expect(page).toHaveURL(/\/login/);

		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Password").fill("not the password");
		await page.getByRole("button", { name: "Sign in" }).click();
		await expect(page.getByText(/invalid email or password/i)).toBeVisible();

		await page.getByLabel("Password").fill(PASSWORD);
		await page.getByRole("button", { name: "Sign in" }).click();
		await expect(page).toHaveURL(/\/p\/[\w-]+\/triage/);
		await expect(page.getByRole("heading", { name: /^Triage/ })).toBeVisible();
	});

	await test.step("signed-out visitors are sent to the login page", async () => {
		const visitor = await browser.newContext({ baseURL: page.url() });
		const visitorPage = await visitor.newPage();
		await visitorPage.goto("/members");
		await expect(visitorPage).toHaveURL(/\/login/);
		await visitor.close();
	});
});
