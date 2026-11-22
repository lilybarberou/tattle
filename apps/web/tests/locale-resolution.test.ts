import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { user } from "#/db/schema";
import { pageLocale } from "#/i18n/route";
import * as fns from "#/server/fns";
import {
	requestContext,
	resetRequestContext,
	signInWith,
} from "./helpers/request-context";
import { setupTestDatabase } from "./helpers/runtime";
import { signUp } from "./helpers/session";

vi.mock("@tanstack/react-start", () => import("./helpers/start-mock"));
vi.mock("@tanstack/react-start/server", () => import("./helpers/start-mock"));

setupTestDatabase();
beforeEach(() => resetRequestContext());

describe("the dashboard's language", () => {
	it("follows Accept-Language for a visitor", async () => {
		requestContext.headers.set("accept-language", "fr-FR,fr;q=0.9");
		expect(await fns.getLocaleFn()).toEqual({
			locale: "fr",
			visitor: "fr",
			visitorSource: "header",
			preference: null,
			baseUrl: "http://localhost:3000",
		});
		requestContext.headers.set("accept-language", "de-DE");
		expect((await fns.getLocaleFn()).locale).toBe("en");
	});

	it("is the person's choice over their browser's, and Auto goes back to it", async () => {
		const person = await signUp();
		signInWith(person.cookie);
		requestContext.headers.set("accept-language", "en-US");
		expect(await fns.getLocaleFn()).toMatchObject({
			locale: "en",
			visitor: "en",
			preference: "auto",
		});

		await fns.setLocalePreferenceFn({ data: { preference: "fr" } });
		expect(await fns.getLocaleFn()).toMatchObject({
			locale: "fr",
			visitor: "en",
			preference: "fr",
		});

		await fns.setLocalePreferenceFn({ data: { preference: "auto" } });
		requestContext.headers.set("accept-language", "fr");
		expect(await fns.getLocaleFn()).toMatchObject({
			locale: "fr",
			visitor: "fr",
			preference: "auto",
		});
	});

	it("remembers the browser's language for emails to someone on Auto", async () => {
		const person = await signUp();
		signInWith(person.cookie);
		requestContext.headers.set("accept-language", "fr-BE, en;q=0.5");
		await fns.getLocaleFn();
		const [row] = await db
			.select({ locale: user.locale, detected: user.detectedLocale })
			.from(user)
			.where(eq(user.id, person.userId));
		expect(row).toEqual({ locale: null, detected: "fr" });
	});

	it("can't be set without signing in", async () => {
		await expect(
			fns.setLocalePreferenceFn({ data: { preference: "fr" } }),
		).rejects.toMatchObject({ status: 401 });
	});
});

describe("a visitor's language", () => {
	it("is the selector's cookie over the browser's", async () => {
		requestContext.headers.set("accept-language", "en-US,en;q=0.9");
		requestContext.cookies.set("tattle_locale", "fr");
		expect(await fns.getLocaleFn()).toMatchObject({
			locale: "fr",
			visitor: "fr",
			visitorSource: "cookie",
		});
	});

	it("is the address's language over the cookie and the browser", async () => {
		requestContext.headers.set("accept-language", "fr");
		requestContext.cookies.set("tattle_locale", "fr");
		expect(await fns.getLocaleFn({ data: { lang: "en" } })).toMatchObject({
			visitor: "en",
			visitorSource: "explicit",
		});
		// Not a language we speak: as if there were none.
		expect(await fns.getLocaleFn({ data: { lang: "de" } })).toMatchObject({
			visitor: "fr",
			visitorSource: "cookie",
		});
	});

	it("is English for robots and clients that send no language", async () => {
		expect(await fns.getLocaleFn()).toMatchObject({
			visitor: "en",
			visitorSource: "default",
		});
		requestContext.headers.set("accept-language", "fr-FR");
		requestContext.headers.set(
			"user-agent",
			"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		);
		expect(await fns.getLocaleFn()).toMatchObject({
			visitor: "en",
			visitorSource: "default",
		});
		// A robot asking for one language explicitly gets it.
		expect((await fns.getLocaleFn({ data: { lang: "fr" } })).visitor).toBe(
			"fr",
		);
	});

	it("becomes the language of someone on Auto who signs in", async () => {
		const person = await signUp();
		signInWith(person.cookie);
		requestContext.headers.set("accept-language", "en-US");
		requestContext.cookies.set("tattle_locale", "fr");
		expect(await fns.getLocaleFn()).toMatchObject({
			locale: "fr",
			preference: "auto",
		});
		const [row] = await db
			.select({ detected: user.detectedLocale })
			.from(user)
			.where(eq(user.id, person.userId));
		expect(row?.detected).toBe("fr");
		// Their own choice still wins.
		await fns.setLocalePreferenceFn({ data: { preference: "en" } });
		expect((await fns.getLocaleFn()).locale).toBe("en");
	});
});

describe("a page's language", () => {
	const root = (
		visitorSource: "explicit" | "cookie" | "header" | "default",
		visitor: "en" | "fr" = "en",
	) => ({
		loaderData: { locale: "en", visitor, visitorSource },
	});
	const page = (defaultLocale?: string) => ({
		staticData: { visitorLocale: true },
		loaderData: { defaultLocale },
	});

	it("is the dashboard's on a page that needs an account", () => {
		expect(
			pageLocale([{ loaderData: { locale: "fr", visitor: "en" } }, {}]),
		).toBe("fr");
	});

	it("is the report's on a thread page when the visitor gave none", () => {
		expect(pageLocale([root("default"), page("fr")])).toBe("fr");
		expect(pageLocale([root("header", "en"), page("fr")])).toBe("en");
		expect(pageLocale([root("cookie", "en"), page("fr")])).toBe("en");
		expect(pageLocale([root("default"), page(undefined)])).toBe("en");
	});
});
