import { createFileRoute } from "@tanstack/react-router";
import { Ingest } from "#/server/Ingest";
import { clientIp, limitIngest } from "#/server/rate-limit";
import { readLimitedJson } from "#/server/request-body";
import { runJson } from "#/server/runtime";

// The widget runs on other sites, so this endpoint answers any origin; the
// project's allowed origins are enforced when the report is submitted.
const corsHeaders = (request: Request): HeadersInit => ({
	"access-control-allow-origin": request.headers.get("origin") ?? "*",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-headers": "content-type",
	"access-control-max-age": "86400",
	vary: "origin",
});

const MAX_BODY_BYTES = 12 * 1024 * 1024;

export const Route = createFileRoute("/api/v1/ingest")({
	server: {
		handlers: {
			OPTIONS: ({ request }) =>
				new Response(null, { status: 204, headers: corsHeaders(request) }),
			POST: async ({ request }) => {
				const headers = corsHeaders(request);
				const read = await readLimitedJson(request, MAX_BODY_BYTES);
				if (!read.ok) {
					return read.reason === "too_large"
						? Response.json(
								{ error: "Report is too large" },
								{ status: 413, headers },
							)
						: Response.json(
								{ error: "Body must be JSON" },
								{ status: 400, headers },
							);
				}
				const body = read.value;
				const projectKey =
					typeof body === "object" && body !== null && "projectKey" in body
						? String((body as { projectKey: unknown }).projectKey)
						: "";
				const limit = limitIngest(clientIp(), projectKey);
				if (!limit.ok) {
					return Response.json(
						{ error: "Too many reports. Try again in a few minutes." },
						{
							status: 429,
							headers: { ...headers, "retry-after": String(limit.retryAfter) },
						},
					);
				}
				return runJson(
					Ingest.use((ingest) =>
						ingest.submit(body, request.headers.get("origin")),
					),
					{ status: 201, headers },
				);
			},
		},
	},
});
