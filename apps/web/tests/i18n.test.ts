import { describe, expect, it } from "vitest";
import {
	i18n,
	isCrawler,
	localeFromAcceptLanguage,
	localeFromCookie,
	messages,
	normalizeLocale,
	preferredLocale,
	resolveVisitorLocale,
} from "#/i18n";
import { en } from "#/i18n/messages/en";
import { fr } from "#/i18n/messages/fr";
import { portalPath, portalRedirect } from "#/i18n/portal-address";

describe("a language tag", () => {
	it("keeps the language Tattle speaks, whatever the region or case", () => {
		expect(normalizeLocale("fr-FR")).toBe("fr");
		expect(normalizeLocale("fr_CA")).toBe("fr");
		expect(normalizeLocale("EN")).toBe("en");
		expect(normalizeLocale(" en-gb ")).toBe("en");
	});

	it("is nothing for another language or a value that is not a tag", () => {
		expect(normalizeLocale("de-DE")).toBeNull();
		expect(normalizeLocale("")).toBeNull();
		expect(normalizeLocale(undefined)).toBeNull();
		expect(normalizeLocale(42)).toBeNull();
	});
});

describe("Accept-Language", () => {
	it("picks the supported language with the highest quality", () => {
		expect(localeFromAcceptLanguage("fr-CH, fr;q=0.9, en;q=0.8")).toBe("fr");
		expect(localeFromAcceptLanguage("en;q=0.5, fr;q=0.8")).toBe("fr");
		expect(localeFromAcceptLanguage("de-DE, fr;q=0.7, en;q=0.6")).toBe("fr");
		expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
	});

	it("keeps the browser's order between equal qualities", () => {
		expect(localeFromAcceptLanguage("fr, en")).toBe("fr");
		expect(localeFromAcceptLanguage("en, fr")).toBe("en");
	});

	it("falls back to English", () => {
		expect(localeFromAcceptLanguage(null)).toBe("en");
		expect(localeFromAcceptLanguage("")).toBe("en");
		expect(localeFromAcceptLanguage("de-DE, ja;q=0.5")).toBe("en");
		expect(localeFromAcceptLanguage("fr;q=0")).toBe("en");
		expect(localeFromAcceptLanguage("*")).toBe("en");
	});
});

describe("a person's language for emails", () => {
	it("is their choice, else their browser's, else the fallback, else English", () => {
		expect(preferredLocale({ locale: "fr", detectedLocale: "en" })).toBe("fr");
		expect(preferredLocale({ locale: null, detectedLocale: "fr" })).toBe("fr");
		expect(preferredLocale({ locale: null, detectedLocale: null }, "fr")).toBe(
			"fr",
		);
		expect(preferredLocale(null)).toBe("en");
		expect(preferredLocale({ locale: "de" })).toBe("en");
	});
});

describe("plurals and numbers", () => {
	it("follow each language's rules", () => {
		expect(en.common.reports(0)).toBe("0 reports");
		expect(en.common.reports(1)).toBe("1 report");
		expect(en.common.reports(1234)).toBe("1,234 reports");
		// French reads 0 as singular, and groups thousands with a space.
		expect(fr.common.reports(0)).toBe("0 signalement");
		expect(fr.common.reports(2)).toBe("2 signalements");
		expect(fr.common.reports(1234)).toBe("1 234 signalements");
		expect(i18n("fr").number(1234.5)).toBe("1 234,5");
	});

	it("format dates by language", () => {
		const date = new Date("2026-11-03T12:00:00Z");
		const options = { day: "numeric", month: "long", timeZone: "UTC" } as const;
		expect(i18n("en").date(date, options)).toBe("November 3");
		expect(i18n("fr").date(date, options)).toBe("3 novembre");
	});
});

describe("the catalogues", () => {
	// The typecheck already fails on a missing key; this catches a message
	// left in English by mistake, or an empty one.
	const leaves = (value: unknown, path = ""): Array<[string, unknown]> =>
		value && typeof value === "object"
			? Object.entries(value).flatMap(([key, child]) =>
					leaves(child, path ? `${path}.${key}` : key),
				)
			: [[path, value]];

	it("have the same keys in every language", () => {
		const keys = (m: object) => leaves(m).map(([path]) => path);
		expect(keys(fr)).toEqual(keys(en));
	});

	it("have no empty message", () => {
		for (const [path, value] of [...leaves(en), ...leaves(fr)]) {
			if (typeof value === "string") expect(value.trim(), path).not.toBe("");
		}
	});

	it("are found by language, English for anything else", () => {
		expect(messages("fr")).toBe(fr);
		expect(messages("xx" as never)).toBe(en);
	});
});

describe("a visitor's language, resolved", () => {
	it("takes the cookie, then the browser", () => {
		const browser = { acceptLanguage: "fr-FR", userAgent: "Mozilla/5.0" };
		expect(resolveVisitorLocale(browser)).toEqual({
			locale: "fr",
			source: "header",
		});
		expect(
			resolveVisitorLocale({ ...browser, cookie: "a=1; tattle_locale=en" }),
		).toEqual({ locale: "en", source: "cookie" });
	});

	it("ignores a cookie in a language we do not speak", () => {
		expect(localeFromCookie("tattle_locale=de")).toBeNull();
		expect(
			resolveVisitorLocale({
				cookie: "tattle_locale=xx",
				acceptLanguage: "fr",
			}),
		).toEqual({ locale: "fr", source: "header" });
	});

	it("gives English to robots", () => {
		for (const userAgent of [
			"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
			"Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
			"Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
			"facebookexternalhit/1.1",
		]) {
			expect(isCrawler(userAgent), userAgent).toBe(true);
			expect(
				resolveVisitorLocale({ acceptLanguage: "fr", userAgent }).locale,
			).toBe("en");
		}
		expect(isCrawler("Mozilla/5.0 (Macintosh) Chrome/142 Safari/537.36")).toBe(
			false,
		);
		expect(resolveVisitorLocale({}).locale).toBe("en");
	});
});

describe("the portal's addresses", () => {
	const GOOGLEBOT =
		"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
	const CHROME = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/142";
	const open = (
		path: string,
		headers: { cookie?: string; acceptLanguage?: string; userAgent?: string },
		method = "GET",
	) =>
		portalRedirect({
			url: `https://tattle.example.org${path}`,
			method,
			cookie: headers.cookie ?? null,
			acceptLanguage: headers.acceptLanguage ?? null,
			userAgent: headers.userAgent ?? CHROME,
		});

	it("are English at the bare address and French under /fr", () => {
		expect(portalPath("shop", "en")).toBe("/portal/shop");
		expect(portalPath("shop", "fr")).toBe("/fr/portal/shop");
	});

	it("send a first-time French-speaking browser to /fr, remembering it", () => {
		expect(
			open("/portal/shop?shipped=true", { acceptLanguage: "fr-FR,fr;q=0.9" }),
		).toEqual({
			status: 302,
			location: "/fr/portal/shop?shipped=true",
			remember: "fr",
		});
		expect(open("/portal/shop/", { acceptLanguage: "fr-CA" })?.location).toBe(
			"/fr/portal/shop",
		);
		expect(open("/portal/shop", { acceptLanguage: "fr" }, "HEAD")?.status).toBe(
			302,
		);
	});

	it("send a remembered French to /fr on every visit, whatever the browser says", () => {
		for (const acceptLanguage of ["en-US", "fr-FR", "de-DE"])
			expect(
				open("/portal/shop?shipped=true", {
					acceptLanguage,
					cookie: "theme=dark; tattle_locale=fr",
				}),
				acceptLanguage,
			).toEqual({ status: 302, location: "/fr/portal/shop?shipped=true" });
	});

	it("keep English for a remembered English", () => {
		expect(
			open("/portal/shop", {
				acceptLanguage: "fr-FR",
				cookie: "tattle_locale=en",
			}),
		).toBeNull();
	});

	it("never redirect robots, even with a cookie", () => {
		for (const cookie of [undefined, "tattle_locale=fr"]) {
			expect(
				open("/portal/shop", {
					acceptLanguage: "fr-FR",
					userAgent: GOOGLEBOT,
					cookie,
				}),
			).toBeNull();
			// No Accept-Language at all: a robot or a script.
			expect(open("/portal/shop", { cookie })).toBeNull();
		}
	});

	it("keep English for other languages and other methods", () => {
		expect(
			open("/portal/shop", { acceptLanguage: "en-US,fr;q=0.5" }),
		).toBeNull();
		expect(open("/portal/shop", { acceptLanguage: "de-DE" })).toBeNull();
		expect(
			open("/portal/shop", { acceptLanguage: "fr-FR" }, "POST"),
		).toBeNull();
	});

	it("never redirect a link to /fr, whatever the cookie", () => {
		for (const cookie of [undefined, "tattle_locale=en", "tattle_locale=fr"]) {
			expect(
				open("/fr/portal/shop", { acceptLanguage: "en-US", cookie }),
			).toBeNull();
			expect(
				open("/fr/portal/shop", { userAgent: GOOGLEBOT, cookie }),
			).toBeNull();
		}
	});

	it("move an old ?lang= address to its language's address", () => {
		expect(open("/portal/shop?lang=fr&shipped=true", {})).toEqual({
			status: 301,
			location: "/fr/portal/shop?shipped=true",
		});
		expect(open("/fr/portal/shop?lang=en", {})).toEqual({
			status: 301,
			location: "/portal/shop",
		});
	});

	it("leave other pages alone", () => {
		for (const path of ["/login", "/portal", "/portal/shop/extra", "/fr"])
			expect(open(path, { acceptLanguage: "fr" }), path).toBeNull();
	});
});
