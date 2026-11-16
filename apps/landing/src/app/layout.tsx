import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
	// Resolves the social images and the canonical address against the public
	// domain instead of localhost.
	metadataBase: new URL("https://tattle.bylily.me"),
	alternates: { canonical: "/" },
	title: "Tattle — bugs et idées, signalés depuis vos apps",
	description:
		"Un widget et un tracker auto-hébergés : chaque rapport arrive avec sa capture annotée, les étapes, la console, le réseau et l'appareil, prêt à être trié par votre équipe ou par un agent IA.",
	openGraph: {
		title: "Tattle",
		description:
			"Bugs et idées, signalés depuis vos apps. Auto-hébergé, open source, prêt pour les agents.",
		url: "/",
		siteName: "Tattle",
		locale: "fr_FR",
		type: "website",
		images: ["/media/promo-poster.jpg"],
	},
	twitter: {
		card: "summary_large_image",
		images: ["/media/promo-poster.jpg"],
	},
};

export const viewport: Viewport = {
	themeColor: "#0c0c0d",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		// The inline script below adds the `js` class before React hydrates.
		<html lang="fr" suppressHydrationWarning>
			<head>
				{/* Hidden-until-revealed styles apply only once this has run, so the
				    page reads in full without script. */}
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: a constant, set before paint
					dangerouslySetInnerHTML={{
						__html: "document.documentElement.classList.add('js')",
					}}
				/>
			</head>
			<body>
				{children}
				<Reveal />
			</body>
		</html>
	);
}
