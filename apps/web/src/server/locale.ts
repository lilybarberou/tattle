import { eq } from "drizzle-orm";
import { db } from "#/db";
import { user } from "#/db/schema";
import {
	type Locale,
	type LocalePreference,
	localeFromAcceptLanguage,
	normalizeLocale,
} from "#/i18n/locales";
import { auth } from "#/lib/auth";

/** The language a visitor's browser asks for; English when it asks for none we have. */
export const visitorLocale = (headers: Headers): Locale =>
	localeFromAcceptLanguage(headers.get("accept-language"));

export type RequestLocale = {
	/** The dashboard's language: the person's choice, else their browser's. */
	locale: Locale;
	/** The browser's language, for public pages (portal, thread, unsubscribe). */
	visitor: Locale;
	/** What the signed-in person chose; null when nobody is signed in. */
	preference: LocalePreference | null;
};

/**
 * The languages of a request. For someone signed in, it also remembers the
 * language their browser asks for, so emails to someone on "Auto" match what
 * their dashboard shows.
 */
export async function requestLocale(headers: Headers): Promise<RequestLocale> {
	const visitor = visitorLocale(headers);
	const session = await auth.api.getSession({ headers }).catch(() => null);
	if (!session) return { locale: visitor, visitor, preference: null };
	const chosen = normalizeLocale(session.user.locale);
	if (session.user.detectedLocale !== visitor) {
		await db
			.update(user)
			.set({ detectedLocale: visitor })
			.where(eq(user.id, session.user.id))
			.catch(() => {});
	}
	return { locale: chosen ?? visitor, visitor, preference: chosen ?? "auto" };
}
