import { Effect } from "effect";
import { Conversations, type ReporterAuth } from "./Conversations";
import { limitReporter } from "./rate-limit";
import { runJson } from "./runtime";

/**
 * The widgets' "My reports": `/api/v1/my-reports`. Same model as ingest: the
 * project's public key, its allowed origins, limits per IP. The caller is the
 * device's reporter key and, when the project verifies identities, the
 * signed-in user with their hash; anything else answers 404.
 *
 *   GET  /api/v1/my-reports                  the reports and the unread count
 *   GET  /api/v1/my-reports/:id              one conversation
 *   POST /api/v1/my-reports/:id/messages     { "body": "…" }
 *   POST /api/v1/my-reports/:id/read         marks the team's messages read
 */
export const REPORTER_HEADERS = [
	"x-tattle-project-key",
	"x-tattle-reporter-key",
	"x-tattle-user-id",
	"x-tattle-user-hash",
] as const;

export const reporterCorsHeaders = (request: Request): HeadersInit => ({
	"access-control-allow-origin": request.headers.get("origin") ?? "*",
	"access-control-allow-methods": "GET, POST, OPTIONS",
	"access-control-allow-headers": ["content-type", ...REPORTER_HEADERS].join(
		", ",
	),
	"access-control-max-age": "86400",
	"cache-control": "no-store",
	vary: "origin",
});

const authOf = (request: Request): ReporterAuth => ({
	projectKey: request.headers.get("x-tattle-project-key") ?? "",
	origin: request.headers.get("origin"),
	reporterKey: request.headers.get("x-tattle-reporter-key"),
	userId: request.headers.get("x-tattle-user-id"),
	userHash: request.headers.get("x-tattle-user-hash"),
});

const MAX_BODY_BYTES = 64 * 1024;

export const handleReporterRequest = async (
	request: Request,
	path: string,
	ip: string,
): Promise<Response> => {
	const headers = reporterCorsHeaders(request);
	if (request.method === "OPTIONS")
		return new Response(null, { status: 204, headers });
	const error = (status: number, message: string, extra?: HeadersInit) =>
		Response.json(
			{ error: message },
			{ status, headers: { ...headers, ...extra } },
		);

	const parts = path.split("/").filter(Boolean);
	const [reportId, action, ...rest] = parts;
	const route =
		request.method === "GET" && parts.length === 0
			? "list"
			: request.method === "GET" && parts.length === 1
				? "get"
				: request.method === "POST" && action === "messages" && !rest.length
					? "post"
					: request.method === "POST" && action === "read" && !rest.length
						? "read"
						: null;
	if (!route) return error(404, "Not found");

	const limit = limitReporter(ip, route === "post");
	if (!limit.ok)
		return error(429, "Too many requests. Try again in a few minutes.", {
			"retry-after": String(limit.retryAfter),
		});

	const auth = authOf(request);
	const id = reportId ?? "";
	switch (route) {
		case "list":
			return runJson(
				Conversations.use((c) => c.listMine(auth)),
				{ headers },
			);
		case "get":
			return runJson(
				Conversations.use((c) => c.getMine(auth, id)),
				{ headers },
			);
		case "read":
			return runJson(
				Conversations.use((c) =>
					c.markMineRead(auth, id).pipe(Effect.as({ ok: true })),
				),
				{ headers },
			);
		case "post": {
			if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
				return error(413, "Message is too long");
			let body: unknown;
			try {
				body = await request.json();
			} catch {
				return error(400, "Body must be JSON");
			}
			const text =
				typeof body === "object" &&
				body !== null &&
				typeof (body as { body?: unknown }).body === "string"
					? (body as { body: string }).body
					: "";
			return runJson(
				Conversations.use((c) => c.postMine(auth, id, text)),
				{ status: 201, headers },
			);
		}
	}
};
