import { DEFAULT_LOCALE, isLocale, type Locale, messages } from "./index";

type Match = { loaderData?: unknown; staticData?: { visitorLocale?: boolean } };

type Languages = {
	locale: Locale;
	visitor: Locale;
	visitorSource?: "explicit" | "cookie" | "header" | "default";
};

/**
 * The language of the page these route matches render. The root route's
 * loader holds the languages. A page used without an account (staticData
 * `visitorLocale`) takes the visitor's; when the visitor gave none (no
 * address language, cookie or Accept-Language), a page's loader may offer a
 * better default as `defaultLocale` (the thread page: the report's).
 */
export const pageLocale = (matches: ReadonlyArray<Match>): Locale => {
	const languages = matches[0]?.loaderData as Languages | undefined;
	if (!languages) return DEFAULT_LOCALE;
	if (!matches.some((m) => m.staticData?.visitorLocale))
		return languages.locale;
	if (languages.visitorSource === "default") {
		for (const match of [...matches].reverse()) {
			const fallback = (match.loaderData as { defaultLocale?: unknown } | null)
				?.defaultLocale;
			if (isLocale(fallback)) return fallback;
		}
	}
	return languages.visitor;
};

/**
 * The page's messages for `head()` (page titles), which runs outside React.
 *
 *     head: ({ matches }) => ({ meta: [{ title: headMessages(matches).x }] })
 */
export const headMessages = (matches: ReadonlyArray<Match>) =>
	messages(pageLocale(matches));

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		/**
		 * A public page (portal, thread, unsubscribe): in the visitor's
		 * browser language, never a signed-in person's dashboard choice.
		 */
		visitorLocale?: boolean;
	}
}
