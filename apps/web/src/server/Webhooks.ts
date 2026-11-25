import { createHmac } from "node:crypto";
import { and, eq, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { Context, Effect, Layer, Schedule, Schema } from "effect";
import {
	type JsonObject,
	project,
	webhookDelivery,
	webhookEndpoint,
} from "#/db/schema";
import { DEFAULT_LOCALE, normalizeLocale } from "#/i18n/locales";
import {
	WEBHOOK_EVENTS,
	type WEBHOOK_FORMATS,
	type WebhookEvent,
} from "#/shared/issues";
import { generateToken } from "./Access";
import { errorKind, inBackground } from "./background";
import { describeEvent, toDiscord, toSlack } from "./chat-format";
import { Database } from "./Database";
import { env } from "./env";
import { type DbError, errorText, InvalidInput, localized } from "./errors";
import { Notifications } from "./Notifications";
import { checkUrlHost } from "./private-address";
import { postPublic } from "./public-request";

export { WEBHOOK_EVENTS, type WebhookEvent };

type WebhookFormat = (typeof WEBHOOK_FORMATS)[number];

class DeliveryFailed extends Schema.TaggedError<DeliveryFailed>()(
	"DeliveryFailed",
	{
		message: Schema.String,
		status: Schema.optional(Schema.Number),
		/** Refused before sending: retrying cannot help. */
		refused: Schema.optional(Schema.Boolean),
	},
) {}

export const PRIVATE_WEBHOOK_REFUSED = errorText(
	DEFAULT_LOCALE,
	"privateWebhookRefused",
);

/** "private" unless ALLOW_PRIVATE_URLS=true: the URL must not be called. */
const privateUrl = async (url: string) =>
	!env.allowPrivateUrls && (await checkUrlHost(url)) === "private";

/**
 * Signature header: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`,
 * computed with the endpoint secret. Receivers should reject timestamps older
 * than a few minutes.
 */
export const signPayload = (secret: string, timestamp: number, body: string) =>
	createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

// 5 retries, 2 seconds apart then doubling: about a minute in all. Tests
// wait for every delivery before the next one starts, so they retry within
// a few hundred milliseconds instead.
const retrySchedule = Schedule.exponential(
	process.env.NODE_ENV === "test" ? "10 millis" : "2 seconds",
).pipe(Schedule.upTo({ times: 5 }));

/** A finished delivery is listed for this long, then deleted. */
export const DELIVERY_LOG_DAYS = 30;
/**
 * A delivery still pending after this long will not be sent: its endpoint
 * was turned off (only active endpoints are retried) or the server was down
 * for a day. Its copy of the report is dropped.
 */
export const PENDING_DELIVERY_HOURS = 24;
const SWEEP_BATCH = 1_000;
const SWEEP_BATCHES_PER_RUN = 50;

export type DeliverySweep = {
	/** Finished deliveries whose copy of the report was dropped. */
	cleared: number;
	/** Pending deliveries given up on. */
	abandoned: number;
	/** Finished deliveries older than DELIVERY_LOG_DAYS, deleted. */
	deleted: number;
};

export class Webhooks extends Context.Service<
	Webhooks,
	{
		/** Queues a delivery to every matching endpoint and returns immediately. */
		readonly emit: (
			projectId: string,
			event: WebhookEvent,
			data: unknown,
		) => Effect.Effect<void>;
		/**
		 * Adds an endpoint. Its URL must be http(s), and not on this machine or
		 * a private network unless ALLOW_PRIVATE_URLS=true.
		 */
		readonly create: (
			projectId: string,
			input: { url: string; events: string[]; format: WebhookFormat },
		) => Effect.Effect<{ id: string }, InvalidInput | DbError>;
		/** Sends a `ping` event to one endpoint of a project and waits for the result. */
		readonly ping: (
			projectId: string,
			endpointId: string,
		) => Effect.Effect<{ ok: boolean; status?: number; error?: string }>;
		/**
		 * Housekeeping, every 6 hours: no delivery keeps a copy of a report once
		 * it will not be sent again (deliveries from before that rule
		 * included), and the delivery log keeps DELIVERY_LOG_DAYS days.
		 */
		readonly sweepDeliveries: Effect.Effect<DeliverySweep, DbError>;
	}
>()("tattle/server/Webhooks") {
	static readonly layer = Layer.effect(
		Webhooks,
		Effect.gen(function* () {
			const database = yield* Database;
			const notifications = yield* Notifications;

			const send = (
				endpoint: { url: string; secret: string; format?: string },
				body: string,
				deliveryId: string,
				event: string,
			) =>
				Effect.tryPromise({
					try: async () => {
						// Checked before each delivery too: a name can later resolve
						// to another address.
						if (await privateUrl(endpoint.url))
							throw new DeliveryFailed({
								message: `Refused: ${PRIVATE_WEBHOOK_REFUSED}`,
								refused: true,
							});
						const timestamp = Math.floor(Date.now() / 1000);
						// Chat apps take their own JSON; only our format is signed.
						const signed: Record<string, string> =
							!endpoint.format || endpoint.format === "json"
								? {
										"x-tattle-event": event,
										"x-tattle-delivery": deliveryId,
										"x-tattle-signature": `t=${timestamp},v1=${signPayload(endpoint.secret, timestamp, body)}`,
									}
								: {};
						// Redirects are never followed (they could lead anywhere, a
						// private address included), and the address is checked again
						// when connecting: the name could resolve elsewhere by then.
						return await postPublic(endpoint.url, {
							headers: {
								"content-type": "application/json",
								"user-agent": "tattle-webhooks/0.1",
								...signed,
							},
							body,
							signal: AbortSignal.timeout(10_000),
							publicOnly: !env.allowPrivateUrls,
						});
					},
					catch: (cause) => {
						if (cause instanceof DeliveryFailed) return cause;
						// The kind only: the text of a network error tells what sits at
						// an address and port, which would make this a port scanner.
						const code = (cause as { code?: unknown } | null)?.code;
						if (code === "EPRIVATEADDRESS")
							return new DeliveryFailed({
								message: `Refused: ${PRIVATE_WEBHOOK_REFUSED}`,
								refused: true,
							});
						if (cause instanceof Error && cause.name === "TimeoutError")
							return new DeliveryFailed({ message: "Timed out" });
						return new DeliveryFailed({ message: "Could not connect" });
					},
				}).pipe(
					Effect.flatMap((status) =>
						status >= 200 && status < 300
							? Effect.succeed(status)
							: Effect.fail(
									new DeliveryFailed({
										message:
											status >= 300 && status < 400
												? `HTTP ${status}: redirects are not followed`
												: `HTTP ${status}`,
										status,
									}),
								),
					),
				);

			// Deliveries this process is sending right now, so the recovery sweep
			// below never sends one twice.
			const inFlight = new Set<string>();

			const deliver = Effect.fn("Webhooks.deliver")(function* (
				endpoint: { id: string; url: string; secret: string; format?: string },
				deliveryId: string,
				event: string,
				body: string,
			) {
				if (inFlight.has(deliveryId)) return;
				inFlight.add(deliveryId);
				yield* Effect.addFinalizer(() =>
					Effect.sync(() => inFlight.delete(deliveryId)),
				);
				const attempt = send(endpoint, body, deliveryId, event).pipe(
					Effect.tapError((error) =>
						database
							.query((db) =>
								db
									.update(webhookDelivery)
									.set({
										attempts: sql`${webhookDelivery.attempts} + 1`,
										lastError: error.message,
										responseStatus: error.status ?? null,
									})
									.where(eq(webhookDelivery.id, deliveryId)),
							)
							.pipe(Effect.ignore),
					),
				);

				const result = yield* attempt.pipe(
					Effect.retry({
						schedule: retrySchedule,
						while: (error) => !error.refused,
					}),
					Effect.result,
				);

				// The payload is kept only while the delivery may be sent again: it
				// holds what reporters wrote, their email and name, which erasure
				// and retention must not leave behind in this table.
				yield* database
					.query((db) =>
						db
							.update(webhookDelivery)
							.set(
								result._tag === "Success"
									? {
											status: "success",
											attempts: sql`${webhookDelivery.attempts} + 1`,
											responseStatus: result.success,
											lastError: null,
											deliveredAt: new Date(),
											payload: {},
										}
									: { status: "failed", payload: {} },
							)
							.where(eq(webhookDelivery.id, deliveryId)),
					)
					.pipe(Effect.ignore);

				if (result._tag === "Success") {
					// Working again: the next outage gets its own email.
					yield* database
						.query((db) =>
							db
								.update(webhookEndpoint)
								.set({ failureNotifiedAt: null })
								.where(
									and(
										eq(webhookEndpoint.id, endpoint.id),
										isNotNull(webhookEndpoint.failureNotifiedAt),
									),
								),
						)
						.pipe(Effect.ignore);
				} else {
					yield* inBackground(
						"Webhook failure email",
						notifications.webhookFailing(
							endpoint.id,
							event,
							result.failure.message,
						),
					);
				}
			}, Effect.scoped);

			// After a restart, deliveries still "pending" were interrupted mid-retry.
			// Every minute, pick up the ones older than the retry window (about 62s)
			// and send them again.
			const resumePending = database
				.query((db) =>
					db
						.select({ delivery: webhookDelivery, endpoint: webhookEndpoint })
						.from(webhookDelivery)
						.innerJoin(
							webhookEndpoint,
							eq(webhookEndpoint.id, webhookDelivery.endpointId),
						)
						.where(
							and(
								eq(webhookDelivery.status, "pending"),
								eq(webhookEndpoint.active, true),
								lt(
									webhookDelivery.createdAt,
									new Date(Date.now() - 2 * 60_000),
								),
							),
						)
						.limit(50),
				)
				.pipe(
					Effect.flatMap((rows) =>
						Effect.forEach(
							rows.filter((row) => !inFlight.has(row.delivery.id)),
							({ delivery, endpoint }) =>
								inBackground(
									"Webhook delivery",
									deliver(
										endpoint,
										delivery.id,
										delivery.event,
										JSON.stringify(delivery.payload),
									),
								),
							{ discard: true },
						),
					),
					Effect.catch((error) =>
						Effect.logError(
							`Webhook recovery sweep failed: ${errorKind(error)}`,
						),
					),
				);
			yield* resumePending.pipe(
				Effect.delay("10 seconds"),
				Effect.repeat(Schedule.spaced("1 minute")),
				Effect.forkScoped,
			);

			/** Runs `update` on batches of ids until a batch comes back short. */
			const inBatches = (
				pick: () => Effect.Effect<Array<{ id: string }>, DbError>,
				apply: (ids: string[]) => Effect.Effect<unknown, DbError>,
			) =>
				Effect.gen(function* () {
					let total = 0;
					for (let batch = 0; batch < SWEEP_BATCHES_PER_RUN; batch++) {
						const rows = yield* pick();
						if (rows.length > 0) yield* apply(rows.map((r) => r.id));
						total += rows.length;
						if (rows.length < SWEEP_BATCH) break;
					}
					return total;
				});

			const sweepDeliveries = Effect.gen(function* () {
				const now = Date.now();
				const empty = sql`'{}'::jsonb`;
				// Finished deliveries from before payloads were dropped on finishing.
				const cleared = yield* inBatches(
					() =>
						database.query((db) =>
							db
								.select({ id: webhookDelivery.id })
								.from(webhookDelivery)
								.where(
									and(
										ne(webhookDelivery.status, "pending"),
										sql`${webhookDelivery.payload} <> ${empty}`,
									),
								)
								.limit(SWEEP_BATCH),
						),
					(ids) =>
						database.query((db) =>
							db
								.update(webhookDelivery)
								.set({ payload: {} })
								.where(inArray(webhookDelivery.id, ids)),
						),
				);
				const abandoned = yield* inBatches(
					() =>
						database.query((db) =>
							db
								.select({ id: webhookDelivery.id })
								.from(webhookDelivery)
								.where(
									and(
										eq(webhookDelivery.status, "pending"),
										lt(
											webhookDelivery.createdAt,
											new Date(now - PENDING_DELIVERY_HOURS * 3_600_000),
										),
									),
								)
								.limit(SWEEP_BATCH),
						),
					(ids) =>
						database.query((db) =>
							db
								.update(webhookDelivery)
								.set({
									status: "failed",
									payload: {},
									lastError: `Not sent within ${PENDING_DELIVERY_HOURS} hours`,
								})
								.where(
									and(
										inArray(webhookDelivery.id, ids),
										eq(webhookDelivery.status, "pending"),
									),
								),
						),
				);
				const deleted = yield* inBatches(
					() =>
						database.query((db) =>
							db
								.select({ id: webhookDelivery.id })
								.from(webhookDelivery)
								.where(
									and(
										ne(webhookDelivery.status, "pending"),
										lt(
											webhookDelivery.createdAt,
											new Date(now - DELIVERY_LOG_DAYS * 24 * 3_600_000),
										),
									),
								)
								.limit(SWEEP_BATCH),
						),
					(ids) =>
						database.query((db) =>
							db
								.delete(webhookDelivery)
								.where(inArray(webhookDelivery.id, ids)),
						),
				);
				return { cleared, abandoned, deleted };
			});
			yield* sweepDeliveries.pipe(
				Effect.tap(({ cleared, abandoned, deleted }) =>
					cleared + abandoned + deleted > 0
						? Effect.logInfo(
								`Webhook deliveries: ${cleared} copies of reports dropped, ${abandoned} stale deliveries given up, ${deleted} old deliveries deleted`,
							)
						: Effect.void,
				),
				Effect.catch((error) =>
					Effect.logError(`Webhook delivery sweep failed: ${errorKind(error)}`),
				),
				Effect.delay("1 minute"),
				Effect.repeat(Schedule.spaced("6 hours")),
				Effect.forkScoped,
			);

			const emit = Effect.fn("Webhooks.emit")(
				function* (projectId: string, event: WebhookEvent, data: unknown) {
					const rows = yield* database.query((db) =>
						db
							.select({ endpoint: webhookEndpoint, project })
							.from(webhookEndpoint)
							.innerJoin(project, eq(project.id, webhookEndpoint.projectId))
							.where(
								and(
									eq(webhookEndpoint.projectId, projectId),
									eq(webhookEndpoint.active, true),
								),
							),
					);

					for (const { endpoint, project: p } of rows) {
						if (
							endpoint.events.length > 0 &&
							!endpoint.events.includes(event)
						) {
							continue;
						}
						const deliveryId = crypto.randomUUID();
						let payload: JsonObject;
						if (endpoint.format === "discord" || endpoint.format === "slack") {
							const message = describeEvent(
								event,
								p.id,
								data,
								normalizeLocale(p.chatLocale) ?? DEFAULT_LOCALE,
							);
							if (!message) continue;
							payload =
								endpoint.format === "discord"
									? toDiscord(message)
									: toSlack(message);
						} else {
							payload = {
								id: deliveryId,
								event,
								createdAt: new Date().toISOString(),
								project: { id: p.id, slug: p.slug, name: p.name },
								data: JSON.parse(JSON.stringify(data ?? null)),
							};
						}
						yield* database.query((db) =>
							db.insert(webhookDelivery).values({
								id: deliveryId,
								endpointId: endpoint.id,
								event,
								payload,
							}),
						);
						yield* inBackground(
							"Webhook delivery",
							deliver(endpoint, deliveryId, event, JSON.stringify(payload)),
						);
					}
				},
				// The kind only: the error carries the payload, which holds reports.
				Effect.catch((error) =>
					Effect.logError(`Webhook emit failed: ${errorKind(error)}`),
				),
			);

			const create = Effect.fn("Webhooks.create")(function* (
				projectId: string,
				input: { url: string; events: string[]; format: WebhookFormat },
			) {
				let url: URL | null = null;
				try {
					url = new URL(input.url.trim());
				} catch {
					url = null;
				}
				if (!url || !["http:", "https:"].includes(url.protocol))
					return yield* new InvalidInput(localized("webhookUrlRequired"));
				if (yield* Effect.promise(() => privateUrl(url.href)))
					return yield* new InvalidInput(localized("privateWebhookRefused"));
				const [row] = yield* database.query((db) =>
					db
						.insert(webhookEndpoint)
						.values({
							projectId,
							url: input.url.trim(),
							events: input.events,
							format: input.format,
							secret: `whsec_${generateToken().token.slice(4)}`,
						})
						.returning({ id: webhookEndpoint.id }),
				);
				if (!row)
					return yield* new InvalidInput(localized("webhookNotCreated"));
				return row;
			});

			const ping = Effect.fn("Webhooks.ping")(
				function* (projectId: string, endpointId: string) {
					const [endpoint] = yield* database.query((db) =>
						db
							.select()
							.from(webhookEndpoint)
							.where(
								and(
									eq(webhookEndpoint.id, endpointId),
									eq(webhookEndpoint.projectId, projectId),
								),
							),
					);
					if (!endpoint) return { ok: false, error: "Endpoint not found" };
					const deliveryId = crypto.randomUUID();
					const body = JSON.stringify({
						id: deliveryId,
						event: "ping",
						createdAt: new Date().toISOString(),
						data: {},
					});
					return yield* send(endpoint, body, deliveryId, "ping").pipe(
						Effect.map((status) => ({ ok: true, status })),
						Effect.catch((error) =>
							Effect.succeed({
								ok: false,
								status: error.status,
								error: error.message,
							}),
						),
					);
				},
				Effect.catch(() =>
					Effect.succeed({ ok: false, error: "Internal error" }),
				),
			);

			return Webhooks.of({ emit, create, ping, sweepDeliveries });
		}),
	);
}
