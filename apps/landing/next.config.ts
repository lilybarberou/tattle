import type { NextConfig } from "next";

// A static site: `next build` writes plain HTML, CSS and JS to out/, which any
// static host (or the Tattle server's own reverse proxy) can serve.
const config: NextConfig = {
	output: "export",
	images: { unoptimized: true },
	trailingSlash: true,
	// `next dev` behind a local HTTPS proxy (Localify) on *.localify domains.
	allowedDevOrigins: ["*.localify", "*.tattle.localify"],
};

export default config;
