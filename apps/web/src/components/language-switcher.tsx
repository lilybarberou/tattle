import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
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

/**
 * EN / FR, for the pages people use without an account (sign-in, password
 * reset, portal, thread, unsubscribe). The choice is kept in a cookie.
 *
 * Each option is a link to the same page with `?lang=`: search engines
 * follow it to the page's other language, and the address's language wins
 * over the cookie, so it is replaced on the way. With `address` false (the
 * default), a page without `?lang=` stays at its address and just reloads
 * in the new language.
 */
export function LanguageSwitcher({
	address = false,
	className,
}: {
	address?: boolean;
	className?: string;
}) {
	const { locale, m } = useI18n();
	const router = useRouter();
	const navigate = useNavigate();
	const location = useLocation();
	const params = new URLSearchParams(location.searchStr);
	const hrefFor = (lang: Locale) => {
		const next = new URLSearchParams(params);
		next.set("lang", lang);
		return `${location.pathname}?${next}${location.hash ? `#${location.hash}` : ""}`;
	};

	const choose = async (
		event: React.MouseEvent<HTMLAnchorElement>,
		lang: Locale,
	) => {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
			return;
		event.preventDefault();
		remember(lang);
		if (address || params.has("lang")) await navigate({ href: hrefFor(lang) });
		else await router.invalidate();
	};

	return (
		<nav
			aria-label={m.common.language.label}
			className={cn(
				"flex items-center gap-0.5 rounded-md border bg-surface p-0.5 text-xs font-medium",
				className,
			)}
		>
			{LOCALES.map((lang) => (
				<a
					key={lang}
					href={hrefFor(lang)}
					hrefLang={lang}
					lang={lang}
					aria-label={LOCALE_NAMES[lang]}
					aria-current={lang === locale ? "true" : undefined}
					title={LOCALE_NAMES[lang]}
					onClick={(event) => void choose(event, lang)}
					className={cn(
						"rounded px-2 py-1 uppercase text-muted-foreground hover:text-ink",
						lang === locale && "bg-active text-ink",
					)}
				>
					{lang}
				</a>
			))}
		</nav>
	);
}
