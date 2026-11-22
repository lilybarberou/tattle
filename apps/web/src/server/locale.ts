import { eq } from "drizzle-orm";
import { db } from "#/db";
import { user } from "#/db/schema";
import {
	type Locale,
	type LocalePreference,
	type LocaleSource,
	normalizeLocale,
	resolveVisitorLocale,
} from "#/i18n/locales";
import { auth } from "#/lib/auth";
import { env } from "./env";

/**
 * A visitor's language: `explicit` (the address's `?lang=`), else the
 * selector's cookie, else Accept-Language; English for robots and clients
 * that send no language.
 */
export const visitorLanguage = (headers: Headers, explicit?: unknown) =>
	resolveVisitorLocale({
		explicit,
		cookie: headers.get("cookie"),
		acceptLanguage: headers.get("accept-language"),
		userAgent: headers.get("user-agent"),
	});

export const visitorLocale = (headers: Headers, explicit?: unknown): Locale =>
	visitorLanguage(headers, explicit).locale;

export type RequestLocale = {
	/** The dashboard's language: the person's choice, else the visitor's. */
	locale: Locale;
	/** The visitor's language, for pages used without an account. */
	visitor: Locale;
	/** Where `visitor` came from. */
	visitorSource: LocaleSource;
	/** What the signed-in person chose; null when nobody is signed in. */
	preference: LocalePreference | null;
	/** The server's public address, for canonical and hreflang links. */
	baseUrl: string;
};

/**
 * The languages of a request. For someone signed in, it also remembers the
 * language their browser asks for (or the one they picked on a page used
 * without an account, in the cookie), so emails to someone on "Auto" match
 * what they see.
 */
export async function requestLocale(
	headers: Headers,
	explicit?: unknown,
): Promise<RequestLocale> {
	const { locale: visitor, source } = visitorLanguage(headers, explicit);
	const base = { visitor, visitorSource: source, baseUrl: env.baseUrl };
	const session = await auth.api.getSession({ headers }).catch(() => null);
	if (!session) return { ...base, locale: visitor, preference: null };
	const chosen = normalizeLocale(session.user.locale);
	// The person's own language, without the address's `?lang=`, which is
	// about one page. Only a real signal (cookie or header) is remembered.
	const own = visitorLanguage(headers);
	if (
		(own.source === "cookie" || own.source === "header") &&
		session.user.detectedLocale !== own.locale
	) {
		await db
			.update(user)
			.set({ detectedLocale: own.locale })
			.where(eq(user.id, session.user.id))
			.catch(() => {});
	}
	return {
		...base,
		locale: chosen ?? own.locale,
		preference: chosen ?? "auto",
	};
}
