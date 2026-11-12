import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { Notifications } from "#/server/Notifications";
import { runtime } from "#/server/runtime";

// One-click unsubscribe (RFC 8058): the List-Unsubscribe header of our emails
// points here, and mail apps POST "List-Unsubscribe=One-Click" when the person
// presses their own Unsubscribe button. The signed token is the access.
export const Route = createFileRoute("/api/v1/unsubscribe/$token")({
	server: {
		handlers: {
			POST: async ({ params }) => {
				const done = await runtime.runPromise(
					Notifications.use((n) => n.unsubscribe(params.token)).pipe(
						Effect.catch(() => Effect.succeed(false)),
					),
				);
				return done
					? new Response("Unsubscribed", { status: 200 })
					: new Response("Unknown link", { status: 404 });
			},
			// Opened in a browser: the page with its button.
			GET: ({ params }) =>
				new Response(null, {
					status: 303,
					headers: { location: `/unsubscribe/${params.token}` },
				}),
		},
	},
});
