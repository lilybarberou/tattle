/**
 * An error with the HTTP status the dashboard shows for it: 401, 403, 404…
 * Server functions throw it (server/runtime.ts), and src/start.ts carries
 * it to the browser with its status, so a page reached by navigating in the
 * app tells "doesn't exist" (404) from "couldn't load" like a direct load.
 */
export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "HttpError";
	}
}
