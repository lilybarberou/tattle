// The languages Tattle speaks, and how one is picked from what a browser, a
// device or a person asks for. Shared by the server and the browser: keep it
// free of server-only imports.

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

/** Used when nothing says otherwise, and for every API, MCP and log message. */
export const DEFAULT_LOCALE: Locale = "en";

/** What a person picks for the dashboard: "auto" follows their browser. */
export const LOCALE_PREFERENCES = ["auto", ...LOCALES] as const;
export type LocalePreference = (typeof LOCALE_PREFERENCES)[number];

/** Each language in its own words, the same whatever the interface language. */
export const LOCALE_NAMES: Record<Locale, string> = {
	en: "English",
	fr: "Français",
};

export const isLocale = (value: unknown): value is Locale =>
	typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/**
 * The supported language of a tag such as "fr-FR", "fr_CA", "EN" or "fr";
 * null for anything else ("de-DE", "", a number…).
 */
export const normalizeLocale = (tag: unknown): Locale | null => {
	if (typeof tag !== "string") return null;
	const base = tag.trim().toLowerCase().split(/[-_]/)[0];
	return isLocale(base) ? base : null;
};

/**
 * The best supported language of an Accept-Language header, by its quality
 * values ("fr-CH, fr;q=0.9, en;q=0.8" → fr); English when none is supported.
 */
export const localeFromAcceptLanguage = (
	header: string | null | undefined,
): Locale => {
	if (!header) return DEFAULT_LOCALE;
	const ranked = header
		.split(",")
		.slice(0, 32)
		.map((part, index) => {
			const [tag = "", ...params] = part.trim().split(";");
			const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
			const quality = q ? Number(q.slice(2)) : 1;
			return {
				locale: normalizeLocale(tag),
				quality: Number.isFinite(quality) ? quality : 0,
				index,
			};
		})
		.filter((entry) => entry.locale !== null && entry.quality > 0)
		.sort((a, b) => b.quality - a.quality || a.index - b.index);
	return ranked[0]?.locale ?? DEFAULT_LOCALE;
};

/**
 * A person's language for what Tattle writes to them: their choice in the
 * dashboard, else the language their browser last asked for, else the
 * fallback (the current request's), else English.
 */
export const preferredLocale = (
	person: { locale?: string | null; detectedLocale?: string | null } | null,
	fallback?: Locale,
): Locale =>
	normalizeLocale(person?.locale) ??
	normalizeLocale(person?.detectedLocale) ??
	fallback ??
	DEFAULT_LOCALE;

/**
 * The cookie that keeps a visitor's choice from the language selector of
 * the pages people use without an account. It wins over Accept-Language.
 */
export const LOCALE_COOKIE = "tattle_locale";

/** One year, like the portal's vote cookie. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The language kept in the cookie header, if any. */
export const localeFromCookie = (cookieHeader: string | null | undefined) => {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(";")) {
		const [name, ...value] = part.trim().split("=");
		if (name === LOCALE_COOKIE) return normalizeLocale(value.join("="));
	}
	return null;
};

/**
 * Search engines and link previews (Slack, Discord, WhatsApp…). They are
 * never redirected and get English on an address without a language.
 */
const CRAWLER =
	/bot\b|bot\/|crawler|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|pinterest|vkshare|w3c_validator|whatsapp|telegram|skypeuripreview|lighthouse/i;

export const isCrawler = (userAgent: string | null | undefined) =>
	Boolean(userAgent && CRAWLER.test(userAgent));

/**
 * Where a visitor's language came from on a page without its own address
 * per language (sign-in, thread, unsubscribe): their choice in the
 * selector (cookie), their browser (Accept-Language), or nothing (a robot,
 * or a client that sends no language): English, unless the page has a
 * better default (a thread page: the report's language). The portal's
 * language is its address's: see portal-address.ts.
 */
export type LocaleSource = "cookie" | "header" | "default";

export const resolveVisitorLocale = (input: {
	cookie?: string | null;
	acceptLanguage?: string | null;
	userAgent?: string | null;
}): { locale: Locale; source: LocaleSource } => {
	const cookie = localeFromCookie(input.cookie);
	if (cookie) return { locale: cookie, source: "cookie" };
	if (!input.acceptLanguage?.trim() || isCrawler(input.userAgent))
		return { locale: DEFAULT_LOCALE, source: "default" };
	return {
		locale: localeFromAcceptLanguage(input.acceptLanguage),
		source: "header",
	};
};
