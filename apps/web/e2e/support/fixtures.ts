/**
 * The suite's `test`: Playwright's, plus
 *
 * - `workspace`: a new organization with one project and its owner (seed.ts);
 * - `dashboard`: a page signed in as that owner;
 * - `signedInPage(user)`: a page of its own (a new browser context) for
 *   someone else, signed in;
 * - `openSite(options)`: the customer's website with the widget, in a browser
 *   context of its own, as the person who reports;
 * - `a11y(page, label)`: axe checks in warning mode.
 *
 * Every browser context sends its own X-Forwarded-For (the app runs with
 * TRUST_PROXY=true), so per-IP limits such as Better Auth's sign-in limit
 * never carry from one test to another. The customer's website gets none: a
 * header added to its cross-origin requests would change CORS.
 */
import { randomInt } from "node:crypto";
import {
	type APIRequestContext,
	type Browser,
	test as base,
	expect,
	type Page,
} from "@playwright/test";
import { APP_URL, SITE_URL } from "../config.ts";
import { type A11yOptions, checkA11y } from "./a11y.ts";
import {
	closeDb,
	type SeededUser,
	type SeededWorkspace,
	seedWorkspace,
} from "./seed.ts";

export const randomIp = () =>
	`10.${randomInt(256)}.${randomInt(256)}.${1 + randomInt(254)}`;

/** Signs in through Better Auth's endpoint; the page's context keeps the cookie. */
export async function signIn(page: Page, user: SeededUser) {
	const response = await page.request.post(
		`${APP_URL}/api/auth/sign-in/email`,
		{
			data: { email: user.email, password: user.password },
			headers: { origin: APP_URL },
		},
	);
	expect(response.status(), await response.text()).toBe(200);
}

/**
 * The dashboard is rendered on the server, then hydrated: a click that lands
 * before React has attached its handlers is lost. Resolves once the page's
 * <main> (or <body>) carries React's props, i.e. is hydrated.
 */
export async function waitForHydration(page: Page) {
	await page.waitForFunction(() => {
		const root = document.querySelector("main") ?? document.body;
		return (
			root !== null &&
			Object.keys(root).some((key) => key.startsWith("__reactProps$"))
		);
	});
}

/** Makes `goto` and `reload` on app pages wait for hydration. */
function hydrating(page: Page) {
	const goto = page.goto.bind(page);
	const reload = page.reload.bind(page);
	const settle = async () => {
		if (page.url().startsWith(APP_URL)) await waitForHydration(page);
	};
	page.goto = async (...args) => {
		const response = await goto(...args);
		await settle();
		return response;
	};
	page.reload = async (...args) => {
		const response = await reload(...args);
		await settle();
		return response;
	};
	return page;
}

async function newDashboardPage(browser: Browser) {
	const context = await browser.newContext({
		baseURL: APP_URL,
		locale: "en-US",
		reducedMotion: "reduce",
		extraHTTPHeaders: { "x-forwarded-for": randomIp() },
	});
	return hydrating(await context.newPage());
}

export type SiteOptions = {
	publicKey: string;
	email?: string;
	name?: string;
	release?: string;
	/** Serve the site with a strict Content-Security-Policy. */
	strictCsp?: boolean;
	/** Reuse the browser context of a page opened before (same device). */
	samePageAs?: Page;
};

/**
 * The widget renders in a closed shadow root, which no test tool can look
 * into. On the customer's website only, shadow roots are created open
 * instead, so tests reach the widget by role and name like a screen reader.
 */
const openShadowRoots = () => {
	const attach = Element.prototype.attachShadow;
	Element.prototype.attachShadow = function (init) {
		return attach.call(this, { ...init, mode: "open" });
	};
};

export const siteUrl = (options: SiteOptions) => {
	const query = new URLSearchParams({ key: options.publicKey });
	if (options.email) query.set("email", options.email);
	if (options.name) query.set("name", options.name);
	if (options.release) query.set("release", options.release);
	if (options.strictCsp) query.set("csp", "strict");
	return `${SITE_URL}/site?${query}`;
};

type Fixtures = {
	workspace: SeededWorkspace;
	dashboard: Page;
	signedInPage: (user: SeededUser) => Promise<Page>;
	/** A signed-out page in a browser context of its own, with its own IP. */
	freshPage: () => Promise<Page>;
	openSite: (options: SiteOptions) => Promise<Page>;
	a11y: (page: Page, label: string, options?: A11yOptions) => Promise<void>;
};

export const test = base.extend<Fixtures, { closeDbAfterWorker: undefined }>({
	extraHTTPHeaders: async ({}, use) => {
		await use({ "x-forwarded-for": randomIp() });
	},
	page: async ({ page }, use) => {
		await use(hydrating(page));
	},
	closeDbAfterWorker: [
		async ({}, use) => {
			await use(undefined);
			await closeDb();
		},
		{ scope: "worker", auto: true },
	],
	workspace: async ({}, use) => {
		await use(await seedWorkspace());
	},
	dashboard: async ({ page, workspace }, use) => {
		await signIn(page, workspace.owner);
		await use(page);
	},
	signedInPage: async ({ browser }, use) => {
		const pages: Page[] = [];
		await use(async (user) => {
			const page = await newDashboardPage(browser);
			pages.push(page);
			await signIn(page, user);
			return page;
		});
		for (const page of pages) await page.context().close();
	},
	freshPage: async ({ browser }, use) => {
		const pages: Page[] = [];
		await use(async () => {
			const page = await newDashboardPage(browser);
			pages.push(page);
			return page;
		});
		for (const page of pages) await page.context().close();
	},
	openSite: async ({ browser }, use) => {
		const pages: Page[] = [];
		await use(async (options) => {
			const context =
				options.samePageAs?.context() ??
				(await browser.newContext({
					locale: "en-US",
					reducedMotion: "reduce",
					// Inside tests, new contexts inherit the suite's options; an
					// extra header on the widget's cross-origin requests would
					// fail their CORS preflight.
					extraHTTPHeaders: {},
					baseURL: undefined,
				}));
			if (!options.samePageAs) await context.addInitScript(openShadowRoots);
			const page = await context.newPage();
			pages.push(page);
			await page.goto(siteUrl(options));
			await expect(
				page.getByRole("button", { name: "Send feedback" }),
			).toBeVisible();
			return page;
		});
		for (const page of pages)
			await page
				.context()
				.close()
				.catch(() => {});
	},
	a11y: async ({}, use, testInfo) => {
		await use((page, label, options) =>
			checkA11y(page, testInfo, label, options).then(() => undefined),
		);
	},
});

export { expect };

/** A 1×1 PNG, enough to store a screenshot. */
export const PNG_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Sends a report the way an app without the widget would (public ingest API). */
export async function sendReport(
	request: APIRequestContext,
	publicKey: string,
	report: {
		message: string;
		type?: "bug" | "feature";
		reporter?: { id?: string; email?: string; name?: string };
		reporterKey?: string;
		release?: string;
		/** A PNG, JPEG or WebP data URL. */
		screenshot?: string;
	},
) {
	const response = await request.post(`${APP_URL}/api/v1/ingest`, {
		data: {
			projectKey: publicKey,
			type: report.type ?? "bug",
			message: report.message,
			pageUrl: "https://shop.example.test/checkout",
			pageTitle: "Checkout",
			device: {
				browser: { name: "Firefox", version: "140" },
				os: { name: "Linux" },
				viewport: { width: 1280, height: 800 },
			},
			console: [],
			network: [],
			...(report.reporter ? { reporter: report.reporter } : {}),
			...(report.reporterKey ? { reporterKey: report.reporterKey } : {}),
			...(report.release ? { release: report.release } : {}),
			...(report.screenshot ? { screenshot: report.screenshot } : {}),
		},
	});
	expect(response.status(), await response.text()).toBe(201);
	return (await response.json()) as { id: string; issueNumber: number };
}
