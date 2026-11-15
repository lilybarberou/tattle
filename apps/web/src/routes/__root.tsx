import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { Toaster } from "#/components/ui/sonner";
import { TooltipProvider } from "#/components/ui/tooltip";
import appCss from "../styles.css?url";

interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Tattle" },
			{
				name: "description",
				content:
					"Bug reports and feature requests from your users, triaged by your agents.",
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
	return (
		<html lang="en">
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
				<TooltipProvider>{children}</TooltipProvider>
				<Toaster />
				<Scripts />
			</body>
		</html>
	);
}
