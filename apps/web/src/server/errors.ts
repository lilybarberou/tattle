import { Schema } from "effect";

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

export class StorageError extends Schema.TaggedError<StorageError>()(
	"StorageError",
	{ message: Schema.String },
) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{ message: Schema.String },
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
	message: Schema.String,
}) {}

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
	message: Schema.String,
}) {}

export class InvalidInput extends Schema.TaggedError<InvalidInput>()(
	"InvalidInput",
	{ message: Schema.String },
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

export const publicMessage = (error: AppError): string =>
	error._tag === "DbError" || error._tag === "StorageError"
		? "Internal server error"
		: error.message;
