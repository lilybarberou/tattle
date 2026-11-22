import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
	useMatches,
} from "@tanstack/react-router";
import { Toaster } from "#/components/ui/sonner";
import { TooltipProvider } from "#/components/ui/tooltip";
import { DEFAULT_LOCALE, messages } from "#/i18n";
import { I18nProvider } from "#/i18n/react";
import "#/i18n/route";
import { getLocaleFn } from "#/server/fns";
import appCss from "../styles.css?url";

interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	// The page's language: the signed-in person's choice, else the browser's
	// Accept-Language. Loaded once; changing the choice invalidates the router.
	loader: () => getLocaleFn(),
	staleTime: Number.POSITIVE_INFINITY,
	preloadStaleTime: Number.POSITIVE_INFINITY,
	head: ({ loaderData }) => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Tattle" },
			{
				name: "description",
				content: messages(loaderData?.locale ?? DEFAULT_LOCALE).common.tagline,
			},
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.ico", sizes: "32x32" },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
			{ rel: "manifest", href: "/site.webmanifest" },
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	const languages = Route.useLoaderData();
	const visitorPage = useMatches({
		select: (matches) => matches.some((m) => m.staticData?.visitorLocale),
	});
	const locale =
		(visitorPage ? languages?.visitor : languages?.locale) ?? DEFAULT_LOCALE;
	return (
		<html lang={locale}>
			<head>
				<HeadContent />
				{/* Tints the browser chrome to match the app frame (--ground). Written
				    here: HeadContent keeps one meta per name, so it dropped the light one. */}
				<meta
					name="theme-color"
					media="(prefers-color-scheme: light)"
					content="#f4f6f8"
				/>
				<meta
					name="theme-color"
					media="(prefers-color-scheme: dark)"
					content="#0c0c0d"
				/>
			</head>
			<body>
				<I18nProvider locale={locale}>
					<TooltipProvider>{children}</TooltipProvider>
				</I18nProvider>
				<Toaster />
				<Scripts />
			</body>
		</html>
	);
}
