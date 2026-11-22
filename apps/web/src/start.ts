import { createSerializationAdapter } from "@tanstack/react-router";
import { createStart } from "@tanstack/react-start";
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

export const startInstance = createStart(() => ({
	serializationAdapters: [httpErrorAdapter, validationErrorAdapter],
}));
