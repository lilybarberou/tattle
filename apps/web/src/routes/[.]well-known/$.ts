import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";

// OAuth discovery for MCP clients. Clients look for metadata at the site root
// (RFC 8414 and RFC 9728, with the issuer or resource path appended); Better
// Auth serves it under /api/auth. This forwards the documents it knows.
const KNOWN = [
	"oauth-protected-resource",
	"oauth-authorization-server",
	"openid-configuration",
] as const;

export const Route = createFileRoute("/.well-known/$")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const name = KNOWN.find(
					(known) =>
						params._splat === known || params._splat?.startsWith(`${known}/`),
				);
				if (!name) return new Response("Not found", { status: 404 });
				// The MCP plugin answers the protected-resource document on its root
				// path; the provider's documents live under the auth base path.
				const url = new URL(request.url);
				if (name !== "oauth-protected-resource") {
					url.pathname = `/api/auth/.well-known/${name}`;
				}
				const response = await auth.handler(
					new Request(url, { headers: request.headers }),
				);
				const headers = new Headers(response.headers);
				headers.set("access-control-allow-origin", "*");
				headers.set("cache-control", "public, max-age=300");
				return new Response(response.body, {
					status: response.status,
					headers,
				});
			},
			OPTIONS: () =>
				new Response(null, {
					status: 204,
					headers: {
						"access-control-allow-origin": "*",
						"access-control-allow-methods": "GET, OPTIONS",
						"access-control-allow-headers": "mcp-protocol-version",
					},
				}),
		},
	},
});
