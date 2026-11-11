import { defineConfig } from "vite";

// Two library builds share this config:
//   `vite build`             -> dist/widget.iife.js (minified, global `Tattle`, deps bundled)
//   `vite build --mode esm`  -> dist/index.js (ESM, html-to-image left as a dependency)
export default defineConfig(({ mode }) => {
	if (mode === "esm") {
		return {
			build: {
				target: "es2020",
				outDir: "dist",
				emptyOutDir: false,
				minify: false,
				sourcemap: true,
				lib: {
					entry: "src/index.ts",
					formats: ["es"],
					fileName: () => "index.js",
				},
				rolldownOptions: {
					external: ["html-to-image"],
				},
			},
		};
	}
	return {
		build: {
			target: "es2020",
			outDir: "dist",
			emptyOutDir: true,
			minify: true,
			sourcemap: false,
			lib: {
				entry: "src/iife.ts",
				name: "Tattle",
				formats: ["iife"],
				fileName: () => "widget.iife.js",
			},
		},
	};
});
