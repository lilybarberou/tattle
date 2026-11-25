import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, type I18n, i18n, type Locale } from "./index";

const I18nContext = createContext<I18n>(i18n(DEFAULT_LOCALE));

/** The language of everything below it; the root route sets it per page. */
export function I18nProvider({
	locale,
	children,
}: {
	locale: Locale;
	children: React.ReactNode;
}) {
	return (
		<I18nContext.Provider value={i18n(locale)}>{children}</I18nContext.Provider>
	);
}

/**
 * The current language: `m` holds the messages, `number`, `plural` and
 * `date` format by language.
 *
 *     const { m } = useI18n();
 *     <h1>{m.triage.title}</h1>
 */
export const useI18n = () => useContext(I18nContext);
