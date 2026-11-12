import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { Database } from "#/server/Database";
import { env } from "#/server/env";
import { runtime } from "#/server/runtime";

// Liveness and database check for Docker and uptime monitors. It goes through
// the Effect runtime on purpose: the first call builds every service, which
// starts background work such as resending webhooks left pending by a restart.
export const Route = createFileRoute("/health")({
	server: {
		handlers: {
			GET: async () => {
				const ok = await runtime.runPromise(
					Database.use((database) =>
						database.query((db) => db.execute(sql`select 1`)),
					).pipe(
						Effect.as(true),
						Effect.catch(() => Effect.succeed(false)),
					),
				);
				const { version } = env.build;
				return ok
					? Response.json({ ok: true, version })
					: Response.json(
							{ ok: false, version, error: "Database unreachable" },
							{ status: 503 },
						);
			},
		},
	},
});
