/**
 * The interface language: a person switches the dashboard to French from
 * their menu, it stays French after a reload, and Auto goes back to the
 * browser's language. Public pages follow the visitor's browser.
 */
import { APP_URL } from "./config.ts";
import { expect, sendReport, test } from "./support/fixtures.ts";
import { db } from "./support/seed.ts";

test("the dashboard switches to French from the user menu, then back to Auto", async ({
	workspace,
	dashboard,
	request,
	a11y,
}) => {
	const { project, owner } = workspace;
	await sendReport(request, project.publicKey, {
		message: "Search ignores accented letters",
	});
	const html = dashboard.locator("html");
	const openLanguageMenu = async (menu: string, language: string) => {
		await dashboard
			.getByRole("button", { name: new RegExp(owner.email) })
			.click();
		await dashboard.getByRole("menuitem", { name: menu }).click();
		await dashboard.getByRole("menuitemradio", { name: language }).click();
	};

	await dashboard.goto(`/p/${project.id}/triage`);
	await expect(html).toHaveAttribute("lang", "en");
	await expect(
		dashboard.getByRole("navigation", { name: "Project" }),
	).toContainText("Feature requests");

	await test.step("choose Français", async () => {
		await openLanguageMenu("Language", "Français");
		await expect(html).toHaveAttribute("lang", "fr");
		const nav = dashboard.getByRole("navigation", { name: "Projet" });
		await expect(nav.getByRole("link", { name: "Tickets" })).toBeVisible();
		await expect(nav.getByRole("link", { name: "Demandes" })).toBeVisible();
		await expect(
			dashboard.getByRole("region", {
				name: "Signalements en attente de décision",
			}),
		).toContainText("Search ignores accented letters");
		await a11y(dashboard, "triage in French");
	});

	await test.step("it is saved on the account", async () => {
		await dashboard.reload();
		await expect(html).toHaveAttribute("lang", "fr");
		await dashboard.goto(`/p/${project.id}/settings`);
		await expect(
			dashboard.getByRole("heading", { name: "Paramètres du projet" }),
		).toBeVisible();
		const [row] = (
			await db().query('select locale from "user" where id = $1', [owner.id])
		).rows;
		expect(row?.locale).toBe("fr");
	});

	await test.step("Auto follows the browser again", async () => {
		await openLanguageMenu("Langue", "Automatique (langue du navigateur)");
		await expect(html).toHaveAttribute("lang", "en");
		await expect(
			dashboard.getByRole("heading", { name: "Project settings" }),
		).toBeVisible();
	});
});

test("public pages follow the visitor's browser language", async ({
	browser,
	workspace,
}) => {
	const { project } = workspace;
	await db().query(
		"update project set portal_enabled = true, portal_slug = $2 where id = $1",
		[project.id, `fr-${project.id.slice(0, 8)}`],
	);
	const context = await browser.newContext({
		baseURL: APP_URL,
		locale: "fr-FR",
	});
	const page = await context.newPage();
	await page.goto(`/portal/fr-${project.id.slice(0, 8)}`);
	await expect(page.locator("html")).toHaveAttribute("lang", "fr");
	await expect(page.getByRole("main")).toContainText("Demandes");
	await context.close();
});

/** A published portal for the workspace's project; returns its address. */
const publishPortal = async (projectId: string) => {
	const slug = `lang-${projectId.slice(0, 8)}`;
	await db().query(
		"update project set portal_enabled = true, portal_slug = $2 where id = $1",
		[projectId, slug],
	);
	return `/portal/${slug}`;
};

test("the sign-in page's language selector is remembered, also on the portal", async ({
	freshPage,
	workspace,
}) => {
	const path = await publishPortal(workspace.project.id);
	const page = await freshPage();
	await page.goto("/login");
	const html = page.locator("html");
	await expect(html).toHaveAttribute("lang", "en");
	await page
		.getByRole("navigation", { name: "Language" })
		.getByRole("link", { name: "Français" })
		.click();
	await expect(html).toHaveAttribute("lang", "fr");
	await expect(
		page.getByRole("heading", { name: "Se connecter" }),
	).toBeVisible();
	// The address stays the same; the choice is kept for the next visits.
	expect(new URL(page.url()).search).toBe("");
	await page.reload();
	await expect(html).toHaveAttribute("lang", "fr");
	await page.goto(path);
	await expect(html).toHaveAttribute("lang", "fr");

	// On the portal, the selector links to the page's address in each language.
	const english = page
		.getByRole("navigation", { name: "Langue" })
		.getByRole("link", { name: "English" });
	await expect(english).toHaveAttribute("href", `${path}?lang=en`);
	await english.click();
	await expect(html).toHaveAttribute("lang", "en");
	await expect(page).toHaveURL(`${APP_URL}${path}?lang=en`);
});
