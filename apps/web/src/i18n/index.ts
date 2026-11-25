// Tattle's interface text in every language it speaks. The English
// catalogue (messages/en) is the reference: each other language is typed
// against it, so a missing or extra key, or a message taking other
// parameters, fails the typecheck. Shared by the server and the browser.

import { dateFormat, formatNumber, type PluralForms, plural } from "./format";
import type { Locale } from "./locales";
import { en, type Messages } from "./messages/en";
import { fr } from "./messages/fr";

export * from "./locales";
export type { Messages };

const CATALOGUES: Record<Locale, Messages> = { en, fr };

export const messages = (locale: Locale): Messages => CATALOGUES[locale] ?? en;

/** Everything a page or an email needs to write in one language. */
export type I18n = {
	locale: Locale;
	m: Messages;
	/** "1,234" / "1 234". */
	number: (value: number, options?: Intl.NumberFormatOptions) => string;
	/** "# report" / "# reports", with "#" as the formatted count. */
	plural: (count: number, forms: PluralForms) => string;
	date: (
		value: Date | string | number,
		options: Intl.DateTimeFormatOptions,
	) => string;
};

const cache = new Map<Locale, I18n>();

export const i18n = (locale: Locale): I18n => {
	const cached = cache.get(locale);
	if (cached) return cached;
	const value: I18n = {
		locale,
		m: messages(locale),
		number: (n, options) => formatNumber(locale, n, options),
		plural: (count, forms) => plural(locale, count, forms),
		date: (d, options) =>
			dateFormat(locale, options).format(d instanceof Date ? d : new Date(d)),
	};
	cache.set(locale, value);
	return value;
};
