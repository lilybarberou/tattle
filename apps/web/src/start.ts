import { createSerializationAdapter } from "@tanstack/react-router";
import { createStart } from "@tanstack/react-start";
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

export const startInstance = createStart(() => ({
	serializationAdapters: [httpErrorAdapter],
}));
