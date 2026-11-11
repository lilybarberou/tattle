import { createFileRoute } from "@tanstack/react-router";
import { handleMcpRequest } from "#/server/mcp";

export const Route = createFileRoute("/api/mcp")({
	server: {
		handlers: {
			POST: ({ request }) => handleMcpRequest(request),
			GET: () =>
				new Response("Method not allowed", {
					status: 405,
					headers: { allow: "POST" },
				}),
		},
	},
});
