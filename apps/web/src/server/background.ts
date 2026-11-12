import { type Cause, Effect, Fiber } from "effect";

// Work that follows a request without holding it up: emails, webhook
// deliveries, the duplicate check after a report. Each one is a detached
// fiber, remembered until it ends so tests (and the test database reset) can
// wait for all of them. Fire-and-forget work always goes through here.
const running = new Set<Fiber.Fiber<unknown, unknown>>();

/**
 * The kinds of failure, never their content: a database error carries the
 * SQL parameters, which can hold what a reporter wrote.
 */
export const causeKinds = (cause: Cause.Cause<unknown>) =>
	cause.reasons
		.map((reason) =>
			reason._tag === "Fail"
				? ((reason.error as { _tag?: string })?._tag ?? "Error")
				: reason._tag,
		)
		.join(", ") || "unknown";

/**
 * Starts `effect` in the background and returns at once. A failure is logged
 * with `label` and its kind; it never reaches the caller.
 */
export const inBackground = <A, E, R>(
	label: string,
	effect: Effect.Effect<A, E, R>,
): Effect.Effect<void, never, R> =>
	effect.pipe(
		Effect.catchCause((cause) =>
			Effect.logError(`${label} failed: ${causeKinds(cause)}`),
		),
		Effect.forkDetach,
		Effect.tap((fiber) =>
			Effect.sync(() => {
				running.add(fiber);
				fiber.addObserver(() => running.delete(fiber));
			}),
		),
		Effect.asVoid,
	);

/** Waits until no background work is left, including work started meanwhile. */
export const backgroundSettled: Effect.Effect<void> = Effect.gen(function* () {
	while (running.size > 0) yield* Fiber.awaitAll([...running]);
});
