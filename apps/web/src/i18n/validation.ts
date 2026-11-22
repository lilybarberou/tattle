import {
	DEFAULT_LOCALE,
	type Locale,
	messages,
	normalizeLocale,
} from "./index";

// A server function's input validation (zod, through Standard Schema) fails
// with an Error whose message is the JSON of the issues, in English and
// written for developers. src/start.ts turns it into one sentence in the
// reader's language when it reaches the browser.

export type ValidationIssue = {
	code: string;
	origin?: string;
	format?: string;
	minimum?: number | string;
	maximum?: number | string;
	path?: Array<string | number>;
};

/** The issues of a validation error's message; null for any other error. */
export const validationIssues = (message: string): ValidationIssue[] | null => {
	if (!message.startsWith("[")) return null;
	try {
		const parsed: unknown = JSON.parse(message);
		if (
			Array.isArray(parsed) &&
			parsed.length > 0 &&
			parsed.every(
				(issue) =>
					issue &&
					typeof issue === "object" &&
					typeof issue.code === "string" &&
					typeof issue.message === "string",
			)
		)
			return parsed.map(({ code, origin, format, minimum, maximum, path }) => ({
				code,
				origin,
				format,
				minimum,
				maximum,
				path,
			}));
	} catch {}
	return null;
};

/** The first issue as one sentence: required, too short or long, email, URL. */
export const validationMessage = (
	issues: ReadonlyArray<ValidationIssue>,
	locale: Locale,
) => {
	const t = messages(locale).common.validation;
	const issue = issues[0];
	if (!issue) return t.invalid;
	const isText = issue.origin === "string";
	switch (issue.code) {
		case "too_small": {
			const min = Number(issue.minimum);
			if (!isText || !Number.isFinite(min)) return t.invalid;
			return min <= 1 ? t.required : t.tooShort(min);
		}
		case "too_big": {
			const max = Number(issue.maximum);
			return isText && Number.isFinite(max) ? t.tooLong(max) : t.invalid;
		}
		case "invalid_format":
			if (issue.format === "email") return t.email;
			if (issue.format === "url") return t.url;
			return t.invalid;
		default:
			return t.invalid;
	}
};

/** The page's language in the browser (<html lang>); English on the server. */
export const documentLocale = (): Locale =>
	typeof document === "undefined"
		? DEFAULT_LOCALE
		: (normalizeLocale(document.documentElement.lang) ?? DEFAULT_LOCALE);
