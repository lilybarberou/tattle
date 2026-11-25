import { Schema } from "effect";
import { DEFAULT_LOCALE, type Locale, type Messages, messages } from "#/i18n";

export class DbError extends Schema.TaggedError<DbError>()("DbError", {
	cause: Schema.Defect(),
}) {}

/**
 * The name of the constraint a database error broke, if any. Drizzle wraps
 * the driver's error ("Failed query: …"), so the name is on a cause further
 * down, never in the message.
 */
export const violatedConstraint = (error: DbError): string | undefined => {
	let cause: unknown = error.cause;
	for (let depth = 0; depth < 4 && cause; depth++) {
		const constraint = (cause as { constraint?: unknown }).constraint;
		if (typeof constraint === "string") return constraint;
		cause = (cause as { cause?: unknown }).cause;
	}
	return undefined;
};

type ErrorMessages = Messages["errors"];
export type ErrorKey = keyof ErrorMessages;
type ParamsOf<K extends ErrorKey> = ErrorMessages[K] extends (
	params: infer P,
) => string
	? [params: P]
	: [];

/** An error message in one language, from the `errors` catalogue. */
export const errorText = <K extends ErrorKey>(
	locale: Locale,
	key: K,
	...params: ParamsOf<K>
): string => {
	const entry = messages(locale).errors[key] as
		| string
		| ((params: unknown) => string);
	return typeof entry === "function" ? entry(params[0]) : entry;
};

/**
 * The fields of an error people may read: the English message (what the
 * REST API and MCP send, and what logs show), and its catalogue key, so the
 * dashboard and public pages show it in the reader's language.
 *
 *     new InvalidInput(localized("titleRequired"))
 */
export const localized = <K extends ErrorKey>(
	key: K,
	...params: ParamsOf<K>
) => ({
	message: errorText(DEFAULT_LOCALE, key, ...params),
	i18n: { key, params: params[0] as unknown },
});

const errorFields = {
	message: Schema.String,
	i18n: Schema.optional(
		Schema.Struct({ key: Schema.String, params: Schema.Unknown }),
	),
};

export class StorageError extends Schema.TaggedError<StorageError>()(
	"StorageError",
	{ message: Schema.String },
) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	errorFields,
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()(
	"Forbidden",
	errorFields,
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
	"NotFound",
	errorFields,
) {}

export class InvalidInput extends Schema.TaggedError<InvalidInput>()(
	"InvalidInput",
	errorFields,
) {}

export type AppError =
	| DbError
	| StorageError
	| Unauthorized
	| Forbidden
	| NotFound
	| InvalidInput;

export const httpStatus = (error: AppError): number => {
	switch (error._tag) {
		case "Unauthorized":
			return 401;
		case "Forbidden":
			return 403;
		case "NotFound":
			return 404;
		case "InvalidInput":
			return 400;
		default:
			return 500;
	}
};

/** What the reader is told, in their language; English by default. */
export const publicMessage = (
	error: AppError,
	locale: Locale = DEFAULT_LOCALE,
): string => {
	if (error._tag === "DbError" || error._tag === "StorageError")
		return errorText(locale, "internal");
	if (error.i18n && error.i18n.key in messages(locale).errors) {
		const entry = messages(locale).errors[error.i18n.key as ErrorKey] as
			| string
			| ((params: unknown) => string);
		return typeof entry === "function" ? entry(error.i18n.params) : entry;
	}
	return error.message;
};
