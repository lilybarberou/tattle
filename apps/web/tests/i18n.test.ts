import { describe, expect, it } from "vitest";
import {
	i18n,
	localeFromAcceptLanguage,
	messages,
	normalizeLocale,
	preferredLocale,
} from "#/i18n";
import { en } from "#/i18n/messages/en";
import { fr } from "#/i18n/messages/fr";

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
