import { useNavigate, useRouter } from "@tanstack/react-router";
import {
	LOCALE_COOKIE,
	LOCALE_COOKIE_MAX_AGE,
	LOCALE_NAMES,
	LOCALES,
	type Locale,
} from "#/i18n/locales";
import { useI18n } from "#/i18n/react";
import { cn } from "#/lib/utils";

/** Keeps the choice for later visits: it wins over the browser's language. */
const remember = (locale: Locale) => {
	const secure = window.location.protocol === "https:" ? "; Secure" : "";
	// biome-ignore lint/suspicious/noDocumentCookie: a plain, readable preference cookie, read by the server.
	document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
};

const optionClass = (current: boolean) =>
	cn(
		"rounded px-2 py-1 uppercase text-muted-foreground hover:text-ink",
		current && "bg-active text-ink",
	);

/**
 * EN / FR, for the pages people use without an account. The choice is kept
 * in a cookie, so it wins over the browser's language on the next visits
 * (and the portal never sends the visitor back to the other language).
 *
 * - With `addresses` (the portal, which has one address per language): each
 *   option is a link to the page's address in that language, with hreflang,
 *   for people and search engines.
 * - Without (sign-in, thread, unsubscribe): buttons; the page stays at its
 *   address and reloads its data in the new language.
 */
export function LanguageSwitcher({
	addresses,
	className,
}: {
	addresses?: Record<Locale, string>;
	className?: string;
}) {
	const { locale, m } = useI18n();
	const router = useRouter();
	const navigate = useNavigate();

	return (
		<nav
			aria-label={m.common.language.label}
			className={cn(
				"flex items-center gap-0.5 rounded-md border bg-surface p-0.5 text-xs font-medium",
				className,
			)}
		>
			{LOCALES.map((lang) =>
				addresses ? (
					<a
						key={lang}
						href={addresses[lang]}
						hrefLang={lang}
						lang={lang}
						aria-label={LOCALE_NAMES[lang]}
						aria-current={lang === locale ? "page" : undefined}
						title={LOCALE_NAMES[lang]}
						// Also for a new tab: the choice holds wherever it opens.
						onAuxClick={() => remember(lang)}
						onClick={(event) => {
							remember(lang);
							if (
								event.metaKey ||
								event.ctrlKey ||
								event.shiftKey ||
								event.button !== 0
							)
								return;
							event.preventDefault();
							void navigate({ href: addresses[lang] });
						}}
						className={optionClass(lang === locale)}
					>
						{lang}
					</a>
				) : (
					<button
						key={lang}
						type="button"
						lang={lang}
						aria-label={LOCALE_NAMES[lang]}
						aria-pressed={lang === locale}
						title={LOCALE_NAMES[lang]}
						onClick={() => {
							if (lang === locale) return;
							remember(lang);
							void router.invalidate();
						}}
						className={optionClass(lang === locale)}
					>
						{lang}
					</button>
				),
			)}
		</nav>
	);
}
