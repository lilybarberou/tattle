import { DEFAULT_LOCALE, type Locale, messages } from "./index";

type Languages = { locale: Locale; visitor: Locale };

/**
 * The language of a page from its route matches, for `head()` (page titles),
 * which runs outside React. The root route's loader holds the languages;
 * public pages (portal, thread, unsubscribe) pass "visitor".
 *
 *     head: ({ matches }) => ({ meta: [{ title: headMessages(matches).x }] })
 */
export const headLocale = (
	matches: ReadonlyArray<{ loaderData?: unknown }>,
	which: keyof Languages = "locale",
): Locale =>
	(matches[0]?.loaderData as Languages | undefined)?.[which] ?? DEFAULT_LOCALE;

export const headMessages = (
	matches: ReadonlyArray<{ loaderData?: unknown }>,
	which: keyof Languages = "locale",
) => messages(headLocale(matches, which));

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		/**
		 * A public page (portal, thread, unsubscribe): in the visitor's
		 * browser language, never a signed-in person's dashboard choice.
		 */
		visitorLocale?: boolean;
	}
}
