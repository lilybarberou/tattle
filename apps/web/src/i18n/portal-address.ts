import {
	DEFAULT_LOCALE,
	isCrawler,
	LOCALE_COOKIE,
	LOCALE_COOKIE_MAX_AGE,
	type Locale,
	localeFromAcceptLanguage,
	localeFromCookie,
	normalizeLocale,
} from "./locales";

// The public portal is the page search engines index, so each language has
// its own address: English at /portal/<slug>, French under /fr. The address
// alone decides the language; the server never answers the bare address in
// French. A visitor whose language is French (remembered in the cookie, or
// on a first visit their browser's) is sent from there to /fr, every time.
// Shared by the server (the redirect, the shipped email) and the browser
// (links): keep it free of server-only imports.

/** The portal's path in one language: /portal/<slug> or /fr/portal/<slug>. */
export const portalPath = (slug: string, locale: Locale) =>
	`${locale === DEFAULT_LOCALE ? "" : `/${locale}`}/portal/${encodeURIComponent(slug)}`;

const PORTAL = /^\/(?:(fr)\/)?portal\/([^/]+)\/?$/;

export type PortalRedirect = {
	status: 301 | 302;
	location: string;
	/** The language to remember from now on (a first visit). */
	remember?: Locale;
};

/**
 * Whether a page request for the portal must go elsewhere, as sites
 * usually do. On the English address (/portal/<slug>):
 * - a remembered French (`tattle_locale=fr`) goes to the French address
 *   (302), on every visit, whatever Accept-Language says;
 * - a remembered English (`tattle_locale=en`, picked in the selector)
 *   stays: the English address serves English;
 * - a first visit (no cookie) from a browser that prefers French goes to
 *   the French address (302), and French is remembered from then on;
 * - robots (known crawler user agents, or no Accept-Language) are never
 *   redirected, even with a cookie.
 * The French address is never redirected: a link to it always opens it.
 * An old `?lang=` address goes to the address of its language (301).
 */
export const portalRedirect = (request: {
	url: string;
	method: string;
	cookie: string | null;
	acceptLanguage: string | null;
	userAgent: string | null;
}): PortalRedirect | null => {
	if (request.method !== "GET" && request.method !== "HEAD") return null;
	const url = new URL(request.url);
	const match = PORTAL.exec(url.pathname);
	if (!match) return null;
	const prefix = match[1] ? normalizeLocale(match[1]) : null;
	const slug = decodeURIComponent(match[2] ?? "");
	const search = new URLSearchParams(url.search);

	if (search.has("lang")) {
		const lang =
			normalizeLocale(search.get("lang")) ?? prefix ?? DEFAULT_LOCALE;
		search.delete("lang");
		const query = search.toString();
		return {
			status: 301,
			location: `${portalPath(slug, lang)}${query ? `?${query}` : ""}`,
		};
	}

	if (prefix) return null;
	if (!request.acceptLanguage?.trim() || isCrawler(request.userAgent))
		return null;
	const french = {
		status: 302 as const,
		location: `${portalPath(slug, "fr")}${url.search}`,
	};
	const remembered = localeFromCookie(request.cookie);
	if (remembered) return remembered === "fr" ? french : null;
	if (localeFromAcceptLanguage(request.acceptLanguage) !== "fr") return null;
	return { ...french, remember: "fr" };
};

/** The Set-Cookie value that remembers a language, as the selector sets it. */
export const localeCookie = (locale: Locale, secure: boolean) =>
	`${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
