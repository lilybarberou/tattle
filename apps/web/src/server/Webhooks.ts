import { createHmac } from "node:crypto";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { Context, Effect, Layer, Schedule, Schema } from "effect";
import {
	type JsonObject,
	project,
	webhookDelivery,
	webhookEndpoint,
} from "#/db/schema";
import { WEBHOOK_EVENTS, type WebhookEvent } from "#/shared/issues";
import { inBackground } from "./background";
import { describeEvent, toDiscord, toSlack } from "./chat-format";
import { Database } from "./Database";
import { Notifications } from "./Notifications";

export { WEBHOOK_EVENTS, type WebhookEvent };

class DeliveryFailed extends Schema.TaggedError<DeliveryFailed>()(
	"DeliveryFailed",
	{ message: Schema.String, status: Schema.optional(Schema.Number) },
) {}

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

export class Webhooks extends Context.Service<
	Webhooks,
	{
		/** Queues a delivery to every matching endpoint and returns immediately. */
		readonly emit: (
			projectId: string,
			event: WebhookEvent,
			data: unknown,
		) => Effect.Effect<void>;
		/** Sends a `ping` event to one endpoint and waits for the result. */
		readonly ping: (
			endpointId: string,
		) => Effect.Effect<{ ok: boolean; status?: number; error?: string }>;
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
						const response = await fetch(endpoint.url, {
							method: "POST",
							headers: {
								"content-type": "application/json",
								"user-agent": "tattle-webhooks/0.1",
								...signed,
							},
							body,
							signal: AbortSignal.timeout(10_000),
						});
						return response.status;
					},
					catch: (cause) => new DeliveryFailed({ message: String(cause) }),
				}).pipe(
					Effect.flatMap((status) =>
						status >= 200 && status < 300
							? Effect.succeed(status)
							: Effect.fail(
									new DeliveryFailed({ message: `HTTP ${status}`, status }),
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
					Effect.retry(retrySchedule),
					Effect.result,
				);

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
										}
									: { status: "failed" },
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
						Effect.logError("Webhook recovery sweep failed", error),
					),
				);
			yield* resumePending.pipe(
				Effect.delay("10 seconds"),
				Effect.repeat(Schedule.spaced("1 minute")),
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
							const message = describeEvent(event, p.id, data);
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
				Effect.catch((error) => Effect.logError("Webhook emit failed", error)),
			);

			const ping = Effect.fn("Webhooks.ping")(
				function* (endpointId: string) {
					const [endpoint] = yield* database.query((db) =>
						db
							.select()
							.from(webhookEndpoint)
							.where(eq(webhookEndpoint.id, endpointId)),
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

			return Webhooks.of({ emit, ping });
		}),
	);
}
