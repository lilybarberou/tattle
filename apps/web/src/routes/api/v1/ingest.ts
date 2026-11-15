import { createFileRoute } from "@tanstack/react-router";
import { Ingest } from "#/server/Ingest";
import {
	clientIp,
	limitIngestIp,
	limitIngestProject,
} from "#/server/rate-limit";
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

/** The shape of a project's public key (see generatePublicKey). */
const PUBLIC_KEY = /^pk_[0-9a-f]{32}$/;

const tooMany = (headers: HeadersInit, retryAfter: number) =>
	Response.json(
		{ error: "Too many reports. Try again in a few minutes." },
		{
			status: 429,
			headers: { ...headers, "retry-after": String(retryAfter) },
		},
	);

export const Route = createFileRoute("/api/v1/ingest")({
	server: {
		handlers: {
			OPTIONS: ({ request }) =>
				new Response(null, { status: 204, headers: corsHeaders(request) }),
			POST: async ({ request }) => {
				const headers = corsHeaders(request);
				// Before reading up to 12 MB: every request counts, JSON or not.
				const perIp = limitIngestIp(clientIp());
				if (!perIp.ok) return tooMany(headers, perIp.retryAfter);
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
				const given =
					typeof body === "object" && body !== null && "projectKey" in body
						? (body as { projectKey: unknown }).projectKey
						: null;
				// A key that cannot exist shares one window, so it never becomes
				// a new entry, however long, in the limits' memory.
				const projectKey =
					typeof given === "string" && PUBLIC_KEY.test(given)
						? given
						: "invalid";
				const perProject = limitIngestProject(projectKey);
				if (!perProject.ok) return tooMany(headers, perProject.retryAfter);
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
