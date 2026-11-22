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

/** A published portal for the workspace's project; returns its English address. */
const publishPortal = async (projectId: string) => {
	const slug = `lang-${projectId.slice(0, 8)}`;
	await db().query(
		"update project set portal_enabled = true, portal_slug = $2 where id = $1",
		[projectId, slug],
	);
	return `/portal/${slug}`;
};

const GOOGLEBOT =
	"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

test("the portal is English at its address and French under /fr", async ({
	request,
	workspace,
}) => {
	const path = await publishPortal(workspace.project.id);
	const french = `/fr${path}`;
	const get = async (url: string, headers: { [name: string]: string }) => {
		const response = await request.get(url, { headers, maxRedirects: 0 });
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
			status: response.status(),
			headers: response.headers(),
			lang: html.match(/<html[^>]* lang="([a-z]+)"/)?.[1],
			canonical: links.find((l) => l.rel === "canonical")?.href,
			alternates: Object.fromEntries(
				links
					.filter((l) => l.rel === "alternate" && l.hreflang)
					.map((l) => [l.hreflang, l.href]),
			),
		};
	};
	const alternates = {
		en: `${APP_URL}${path}`,
		fr: `${APP_URL}${french}`,
		"x-default": `${APP_URL}${path}`,
	};

	await test.step("a French browser is sent to /fr once, and it is remembered", async () => {
		const page = await get(`${path}?shipped=true`, {
			"accept-language": "fr-FR,fr;q=0.9",
		});
		expect(page.status).toBe(302);
		expect(page.headers.location).toBe(`${french}?shipped=true`);
		expect(page.headers["set-cookie"]).toContain("tattle_locale=fr");
		expect(page.headers.vary).toContain("Accept-Language");
	});

	await test.step("robots and remembered choices stay on the English address", async () => {
		const cases: Array<{ [name: string]: string }> = [
			{ "accept-language": "fr-FR", "user-agent": GOOGLEBOT },
			{ "accept-language": "" },
			{ "accept-language": "fr-FR", cookie: "tattle_locale=en" },
			{ "accept-language": "en-US" },
		];
		for (const headers of cases) {
			const page = await get(path, headers);
			expect(page.status, JSON.stringify(headers)).toBe(200);
			expect(page.lang).toBe("en");
		}
		const english = await get(path, { "accept-language": "en-US" });
		expect(english.headers.vary).toContain("Accept-Language");
		expect(english.canonical).toBe(`${APP_URL}${path}`);
		expect(english.alternates).toEqual(alternates);
	});

	await test.step("/fr is French for any browser, and its own canonical", async () => {
		const cases: Array<{ [name: string]: string }> = [
			{ "accept-language": "en-US" },
			{ "accept-language": "en-US", cookie: "tattle_locale=en" },
			{ "user-agent": GOOGLEBOT },
		];
		for (const headers of cases) {
			const page = await get(french, headers);
			expect(page.status, JSON.stringify(headers)).toBe(200);
			expect(page.lang).toBe("fr");
			expect(page.canonical).toBe(`${APP_URL}${french}`);
			expect(page.alternates).toEqual(alternates);
		}
	});

	await test.step("an old ?lang= address moves to its language's address", async () => {
		const page = await get(`${path}?lang=fr`, {});
		expect(page.status).toBe(301);
		expect(page.headers.location).toBe(french);
	});
});

test("a French browser reads the portal at /fr, and English sticks once chosen", async ({
	browser,
	workspace,
}) => {
	const path = await publishPortal(workspace.project.id);
	const context = await browser.newContext({
		baseURL: APP_URL,
		locale: "fr-FR",
	});
	const page = await context.newPage();
	const html = page.locator("html");
	await page.goto(path);
	await expect(page).toHaveURL(`${APP_URL}/fr${path}`);
	await expect(html).toHaveAttribute("lang", "fr");
	await expect(page.getByRole("main")).toContainText("Demandes");

	// The tabs stay at the French address.
	await page.getByRole("link", { name: /^Disponibles/ }).click();
	await expect(page).toHaveURL(`${APP_URL}/fr${path}?shipped=true`);

	// EN in the selector goes to the English address and is never undone.
	const english = page
		.getByRole("navigation", { name: "Langue" })
		.getByRole("link", { name: "English" });
	await expect(english).toHaveAttribute("href", `${path}?shipped=true`);
	await english.click();
	await expect(page).toHaveURL(`${APP_URL}${path}?shipped=true`);
	await expect(html).toHaveAttribute("lang", "en");
	await page.goto(path);
	await expect(page).toHaveURL(`${APP_URL}${path}`);
	await expect(html).toHaveAttribute("lang", "en");
	await context.close();
});

test("the sign-in page's language selector is remembered", async ({
	freshPage,
}) => {
	const page = await freshPage();
	await page.goto("/login");
	const html = page.locator("html");
	await expect(html).toHaveAttribute("lang", "en");
	await page
		.getByRole("navigation", { name: "Language" })
		.getByRole("button", { name: "Français" })
		.click();
	await expect(html).toHaveAttribute("lang", "fr");
	await expect(
		page.getByRole("heading", { name: "Se connecter" }),
	).toBeVisible();
	// The address stays the same; the choice is kept for the next visits.
	expect(new URL(page.url()).pathname).toBe("/login");
	await page.reload();
	await expect(html).toHaveAttribute("lang", "fr");
});

test("a value the server refuses is explained in the page's language", async ({
	browser,
	workspace,
}) => {
	const path = await publishPortal(workspace.project.id);
	const context = await browser.newContext({
		baseURL: APP_URL,
		locale: "fr-FR",
	});
	const page = await context.newPage();
	await page.goto(`/fr${path}`);
	await page.getByRole("button", { name: "Suggérer une idée" }).click();
	const title = page.getByRole("textbox", { name: "Votre idée en une ligne" });
	// Past the form's own check, as a script would: the server checks again.
	await title.evaluate((input) => input.removeAttribute("minlength"));
	await title.fill("abc");
	await page.getByRole("button", { name: "Envoyer l'idée" }).click();
	await expect(
		page.getByText("Trop court : au moins 4 caractères"),
	).toBeVisible();
	await context.close();
});
