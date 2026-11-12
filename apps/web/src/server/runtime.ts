import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";
import { Access } from "./Access";
import { AiSettings } from "./AiSettings";
import { causeKinds } from "./background";
import { Conversations } from "./Conversations";
import { Database } from "./Database";
import { DataLifecycle } from "./DataLifecycle";
import { Duplicates } from "./Duplicates";
import { type AppError, httpStatus, publicMessage } from "./errors";
import { GitHub } from "./GitHub";
import { Ingest } from "./Ingest";
import { Issues } from "./Issues";
import { Notifications } from "./Notifications";
import { Overview } from "./Overview";
import { Portal } from "./Portal";
import { Storage } from "./Storage";
import { Webhooks } from "./Webhooks";

const Infra = Layer.mergeAll(Database.layer, Storage.layer);
const NotificationsLive = Notifications.layer.pipe(Layer.provide(Infra));
const WebhooksLive = Webhooks.layer.pipe(
	Layer.provide(Layer.mergeAll(Infra, NotificationsLive)),
);
const IssuesLive = Issues.layer.pipe(
	Layer.provide(Layer.mergeAll(Infra, WebhooksLive, NotificationsLive)),
);
const AccessLive = Access.layer.pipe(Layer.provide(Infra));
const AiSettingsLive = AiSettings.layer.pipe(
	Layer.provide(Layer.mergeAll(Infra, AccessLive, NotificationsLive)),
);
const DuplicatesLive = Duplicates.layer.pipe(
	Layer.provide(Layer.mergeAll(Infra, AiSettingsLive)),
);

export const AppLayer = Layer.mergeAll(
	Infra,
	NotificationsLive,
	WebhooksLive,
	IssuesLive,
	AccessLive,
	AiSettingsLive,
	DuplicatesLive,
	DataLifecycle.layer.pipe(Layer.provide(Infra)),
	Overview.layer.pipe(Layer.provide(Layer.mergeAll(Infra, AccessLive))),
	Portal.layer.pipe(Layer.provide(Layer.mergeAll(Infra, IssuesLive))),
	GitHub.layer.pipe(Layer.provide(Layer.mergeAll(Infra, IssuesLive))),
	Ingest.layer.pipe(
		Layer.provide(
			Layer.mergeAll(Infra, WebhooksLive, IssuesLive, DuplicatesLive),
		),
	),
	Conversations.layer.pipe(Layer.provide(Layer.mergeAll(Infra, WebhooksLive))),
);

type Services = Layer.Success<typeof AppLayer>;

// One runtime per server process. In development, a module reload builds a new
// runtime with the new service code and disposes the old one.
export const runtime: ManagedRuntime.ManagedRuntime<Services, never> =
	ManagedRuntime.make(AppLayer);
if (import.meta.hot) {
	import.meta.hot.dispose(() => runtime.dispose());
}

export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

const isAppError = (error: unknown): error is AppError =>
	typeof error === "object" &&
	error !== null &&
	"_tag" in error &&
	[
		"DbError",
		"StorageError",
		"Unauthorized",
		"Forbidden",
		"NotFound",
		"InvalidInput",
	].includes((error as { _tag: string })._tag);

/** Runs a program; typed failures become `HttpError`, defects are logged and hidden. */
export const run = async <A>(
	program: Effect.Effect<A, AppError, Services>,
): Promise<A> => {
	const exit = await runtime.runPromiseExit(program);
	if (Exit.isSuccess(exit)) return exit.value;
	const failure = Cause.findErrorOption(exit.cause);
	if (failure._tag === "Some" && isAppError(failure.value)) {
		if (
			failure.value._tag === "DbError" ||
			failure.value._tag === "StorageError"
		) {
			// The kind and code only: a database error carries the SQL parameters,
			// which can hold what a reporter wrote or someone's email.
			await runtime.runPromise(
				Effect.logError(`Request failed: ${causeKinds(exit.cause)}`),
			);
		}
		throw new HttpError(
			httpStatus(failure.value),
			publicMessage(failure.value),
		);
	}
	await runtime.runPromise(Effect.logError(Cause.pretty(exit.cause)));
	throw new HttpError(500, "Internal server error");
};

/** Same as `run`, but returns a JSON Response for API routes. */
export const runJson = async <A>(
	program: Effect.Effect<A, AppError, Services>,
	init?: { status?: number; headers?: HeadersInit },
): Promise<Response> => {
	try {
		const value = await run(program);
		return Response.json(value, {
			status: init?.status ?? 200,
			headers: init?.headers,
		});
	} catch (error) {
		const status = error instanceof HttpError ? error.status : 500;
		const message =
			error instanceof HttpError ? error.message : "Internal server error";
		return Response.json(
			{ error: message },
			{ status, headers: init?.headers },
		);
	}
};
