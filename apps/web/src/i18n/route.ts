import { DEFAULT_LOCALE, isLocale, type Locale, messages } from "./index";

type Match = {
	loaderData?: unknown;
	staticData?: { visitorLocale?: boolean; pageLocale?: Locale };
};

type Languages = {
	locale: Locale;
	visitor: Locale;
	visitorSource?: "cookie" | "header" | "default";
};

/**
 * The language of the page these route matches render:
 * - a page with one address per language (the portal: staticData
 *   `pageLocale`) is in its address's language;
 * - a page used without an account (staticData `visitorLocale`) takes the
 *   visitor's, from the root route's loader; when the visitor gave none
 *   (no cookie or Accept-Language), a page's loader may offer a better
 *   default as `defaultLocale` (the thread page: the report's);
 * - any other page is in the dashboard's language.
 */
export const pageLocale = (matches: ReadonlyArray<Match>): Locale => {
	const fixed = matches.find((m) => m.staticData?.pageLocale)?.staticData
		?.pageLocale;
	if (fixed) return fixed;
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
		/**
		 * A page with one address per language (the portal: /portal/<slug>
		 * in English, /fr/portal/<slug> in French): always in this language.
		 */
		pageLocale?: Locale;
	}
}
