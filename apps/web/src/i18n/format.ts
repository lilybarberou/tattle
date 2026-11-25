import type { Locale } from "./locales";

// Plurals, numbers and dates by language, with Intl. Formatters are built
// once per language and options: creating them is slow.

const pluralRules = new Map<Locale, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export const formatNumber = (
	locale: Locale,
	value: number,
	options?: Intl.NumberFormatOptions,
) => {
	const key = `${locale}|${JSON.stringify(options ?? {})}`;
	let format = numberFormats.get(key);
	if (!format) {
		format = new Intl.NumberFormat(locale, options);
		numberFormats.set(key, format);
	}
	return format.format(value);
};

export const dateFormat = (
	locale: Locale,
	options: Intl.DateTimeFormatOptions,
) => {
	const key = `${locale}|${JSON.stringify(options)}`;
	let format = dateFormats.get(key);
	if (!format) {
		format = new Intl.DateTimeFormat(locale, options);
		dateFormats.set(key, format);
	}
	return format;
};

export type PluralForms = { one: string; other: string };

/**
 * The form for `count`, with "#" replaced by the formatted number. French
 * reads 0 and 1 as singular ("0 signalement"), English only 1.
 */
export const plural = (locale: Locale, count: number, forms: PluralForms) => {
	let rules = pluralRules.get(locale);
	if (!rules) {
		rules = new Intl.PluralRules(locale);
		pluralRules.set(locale, rules);
	}
	const form = rules.select(count) === "one" ? forms.one : forms.other;
	return form.replaceAll("#", formatNumber(locale, count));
};

/** `plural` bound to one language, for the message catalogues. */
export const pluralizer =
	(locale: Locale) => (count: number, forms: PluralForms) =>
		plural(locale, count, forms);

/** "1,234" in English, "1 234" in French. */
export const numberer = (locale: Locale) => (value: number) =>
	formatNumber(locale, value);
