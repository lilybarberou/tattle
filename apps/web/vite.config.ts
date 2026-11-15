import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		nitro({
			rollupConfig: { external: [/^@sentry\//] },
			// Scripts, styles and fonts are also written as .gz and .br files, and
			// served compressed to browsers that accept it: the default compose
			// file and most hosting panels put no compressing proxy in front.
			compressPublicAssets: { gzip: true, brotli: true },
			routeRules: {
				// No page may be shown inside another site's frame, so nobody can
				// trick a signed-in user into clicking "Allow" on /consent.
				"/**": {
					headers: {
						"content-security-policy": "frame-ancestors 'none'",
						"x-frame-options": "DENY",
					},
				},
			},
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
