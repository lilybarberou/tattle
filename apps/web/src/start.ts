import { createSerializationAdapter } from "@tanstack/react-router";
import { createMiddleware, createStart } from "@tanstack/react-start";
import { localeCookie, portalRedirect } from "#/i18n/portal-address";
import {
	documentLocale,
	type ValidationIssue,
	validationIssues,
	validationMessage,
} from "#/i18n/validation";
import { HttpError } from "#/shared/http-error";

/**
 * A server function's HttpError reaches the browser with its status. Without
 * it, only the message crossed: navigating in the app to an issue that does
 * not exist showed "This page couldn't load" instead of the 404 page.
 */
const httpErrorAdapter = createSerializationAdapter({
	key: "tattle/http-error",
	test: (value) => value instanceof HttpError,
	toSerializable: (error) => ({ status: error.status, message: error.message }),
	fromSerializable: ({ status, message }) => new HttpError(status, message),
});

/**
 * A server function's input that failed validation: its message is the JSON
 * of zod's issues, for developers. The browser gets a 400 with one sentence
 * in the page's language instead ("Fill in this field", "Too long…").
 */
const validationErrorAdapter = createSerializationAdapter({
	key: "tattle/validation-error",
	test: (value): value is Error =>
		value instanceof Error &&
		!(value instanceof HttpError) &&
		validationIssues(value.message) !== null,
	toSerializable: (error) => ({
		issues: validationIssues(error.message) as ValidationIssue[],
	}),
	fromSerializable: ({ issues }) =>
		new HttpError(400, validationMessage(issues, documentLocale())),
});

/**
 * The portal's addresses (see i18n/portal-address.ts): a visitor whose
 * language is French (remembered in the cookie, or on a first visit their
 * browser's) opening /portal/<slug> is sent to /fr/portal/<slug>. A first
 * visit remembers French. Robots and links to /fr are never redirected.
 * Page requests only, never server functions.
 */
const portalAddressMiddleware = createMiddleware().server(
	({ request, next, handlerType }) => {
		if (handlerType !== "router") return next();
		const redirect = portalRedirect({
			url: request.url,
			method: request.method,
			cookie: request.headers.get("cookie"),
			acceptLanguage: request.headers.get("accept-language"),
			userAgent: request.headers.get("user-agent"),
		});
		if (!redirect) return next();
		const headers = new Headers({
			Location: redirect.location,
			Vary: "Accept-Language, Cookie",
			"Cache-Control": "private, no-store",
		});
		if (redirect.remember) {
			const secure = (globalThis.process?.env.BETTER_AUTH_URL ?? "").startsWith(
				"https://",
			);
			headers.append("Set-Cookie", localeCookie(redirect.remember, secure));
		}
		return new Response(null, { status: redirect.status, headers });
	},
);

export const startInstance = createStart(() => ({
	serializationAdapters: [httpErrorAdapter, validationErrorAdapter],
	requestMiddleware: [portalAddressMiddleware],
}));
