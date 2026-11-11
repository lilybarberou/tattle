import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { withClientIp } from "#/server/rate-limit";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: ({ request }) => auth.handler(withClientIp(request)),
			POST: ({ request }) => auth.handler(withClientIp(request)),
		},
	},
});
