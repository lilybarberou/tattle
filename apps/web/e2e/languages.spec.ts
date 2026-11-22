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

test("the portal has one address per language and never redirects", async ({
	request,
	workspace,
}) => {
	const path = await publishPortal(workspace.project.id);
	const get = async (url: string, headers: Record<string, string>) => {
		const response = await request.get(url, { headers, maxRedirects: 0 });
		expect(response.status(), url).toBe(200);
		expect(response.url()).toBe(`${APP_URL}${url}`);
		const html = await response.text();
		const links = [...html.matchAll(/<link [^>]*>/g)].map((tag) =>
			Object.fromEntries(
				[...tag[0].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map((a) => [
					a[1]?.toLowerCase(),
					a[2]?.replaceAll("&amp;", "&"),
				]),
			),
		);
		return {
			lang: html.match(/<html[^>]* lang="([a-z]+)"/)?.[1],
			canonical: links.find((l) => l.rel === "canonical")?.href,
			alternates: Object.fromEntries(
				links
					.filter((l) => l.rel === "alternate" && l.hreflang)
					.map((l) => [l.hreflang, l.href]),
			),
			vary: response.headers().vary,
		};
	};

	await test.step("the bare address answers in the browser's language", async () => {
		const page = await get(path, { "accept-language": "fr-FR,fr;q=0.9" });
		expect(page.lang).toBe("fr");
		expect(page.vary).toContain("Accept-Language");
		// Its canonical is itself; each language has its own address.
		expect(page.canonical).toBe(`${APP_URL}${path}`);
		expect(page.alternates).toEqual({
			en: `${APP_URL}${path}?lang=en`,
			fr: `${APP_URL}${path}?lang=fr`,
			"x-default": `${APP_URL}${path}`,
		});
	});

	await test.step("the cookie wins over the browser, the address over both", async () => {
		const french = { "accept-language": "fr-FR", cookie: "tattle_locale=en" };
		expect((await get(path, french)).lang).toBe("en");
		const explicit = await get(`${path}?lang=fr`, {
			"accept-language": "en-US",
			cookie: "tattle_locale=en",
		});
		expect(explicit.lang).toBe("fr");
		expect(explicit.canonical).toBe(`${APP_URL}${path}?lang=fr`);
	});

	await test.step("robots get English on the bare address", async () => {
		const googlebot = {
			"user-agent":
				"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
			"accept-language": "fr-FR",
		};
		expect((await get(path, googlebot)).lang).toBe("en");
		expect((await get(path, { "accept-language": "" })).lang).toBe("en");
		expect((await get(`${path}?lang=fr`, googlebot)).lang).toBe("fr");
	});
});

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
