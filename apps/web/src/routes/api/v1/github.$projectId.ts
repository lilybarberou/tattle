import { createFileRoute } from "@tanstack/react-router";
import { GitHub } from "#/server/GitHub";
import { clientIp, limitGithub } from "#/server/rate-limit";
import { readLimitedBody } from "#/server/request-body";
import { run } from "#/server/runtime";

// Pull request payloads are a few dozen KB; GitHub caps deliveries at 25 MB.
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// The webhook a project's GitHub repository calls (Settings → Webhooks).
// Every delivery is checked against the project's secret before anything else.
export const Route = createFileRoute("/api/v1/github/$projectId")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const limit = limitGithub(clientIp(), params.projectId);
				if (!limit.ok) {
					return Response.json(
						{ ok: false, message: "Too many deliveries" },
						{
							status: 429,
							headers: { "retry-after": String(limit.retryAfter) },
						},
					);
				}
				const read = await readLimitedBody(request, MAX_BODY_BYTES);
				if (!read.ok) {
					return read.reason === "too_large"
						? Response.json(
								{ ok: false, message: "Payload is too large" },
								{ status: 413 },
							)
						: Response.json(
								{ ok: false, message: "The body could not be read" },
								{ status: 400 },
							);
				}
				const body = read.bytes;
				try {
					const result = await run(
						GitHub.use((github) =>
							github.receive(params.projectId, {
								event: request.headers.get("x-github-event"),
								signature: request.headers.get("x-hub-signature-256"),
								body,
							}),
						),
					);
					return Response.json(result.body, { status: result.status });
				} catch {
					return Response.json(
						{ ok: false, message: "Internal server error" },
						{ status: 500 },
					);
				}
			},
		},
	},
});
