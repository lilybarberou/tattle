import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { aiSettings } from "#/db/schema";
import {
	AI_PROVIDER_META,
	type AiProvider,
	type AiSettingsView,
} from "#/shared/ai";
import { Access, type Principal } from "./Access";
import {
	type AiConfig,
	decryptSecret,
	encryptSecret,
	testConnection,
} from "./ai";
import { inBackground } from "./background";
import { Database } from "./Database";
import { type DbError, type Forbidden, InvalidInput } from "./errors";
import { Notifications } from "./Notifications";

export type AiSettingsInput = {
	provider: AiProvider;
	baseUrl?: string | null;
	model?: string;
	/** A new key; empty or missing keeps the saved one. */
	apiKey?: string;
	enabled: boolean;
};

export type AiTestResult = { ok: true } | { ok: false; error: string };

type Row = typeof aiSettings.$inferSelect;

const ADMIN_ONLY = "Only owners and admins can change the AI settings";

/** Answers that say the key itself is the problem, not the request. */
const REFUSED_STATUSES = [401, 402, 403, 429];
/** Refused calls in a row before owners and admins are told. */
export const REFUSALS_BEFORE_EMAIL = 3;

const needsKey = (provider: AiProvider) => provider !== "openai_compatible";

const normalizeBaseUrl = (provider: AiProvider, baseUrl?: string | null) =>
	Effect.gen(function* () {
		if (provider !== "openai_compatible") return null;
		const value = baseUrl?.trim() ?? "";
		let url: URL | null = null;
		try {
			url = new URL(value);
		} catch {
			url = null;
		}
		if (!url || !["http:", "https:"].includes(url.protocol)) {
			return yield* new InvalidInput({
				message:
					"Enter the server's base URL, e.g. https://api.mistral.ai/v1 or http://localhost:11434/v1",
			});
		}
		return value.replace(/\/+$/, "");
	});

const normalizeModel = (provider: AiProvider, model?: string) =>
	Effect.gen(function* () {
		const value = model?.trim() || AI_PROVIDER_META[provider].defaultModel;
		if (!value)
			return yield* new InvalidInput({ message: "Enter the model to use" });
		if (value.length > 200)
			return yield* new InvalidInput({
				message: "That model name is too long",
			});
		return value;
	});

export class AiSettings extends Context.Service<
	AiSettings,
	{
		/** What any member sees; `canManage` says whether they may change it. */
		readonly view: (
			principal: Principal,
			organizationId: string,
		) => Effect.Effect<AiSettingsView, Forbidden | DbError>;
		readonly save: (
			principal: Principal,
			organizationId: string,
			input: AiSettingsInput,
		) => Effect.Effect<AiSettingsView, Forbidden | InvalidInput | DbError>;
		/** Forgets the provider and the key. */
		readonly remove: (
			principal: Principal,
			organizationId: string,
		) => Effect.Effect<void, Forbidden | DbError>;
		/** A tiny call with these settings (the saved key when none is typed). */
		readonly test: (
			principal: Principal,
			organizationId: string,
			input: Omit<AiSettingsInput, "enabled">,
		) => Effect.Effect<AiTestResult, Forbidden | InvalidInput | DbError>;
		/** The settings to call the AI with, or null when it is off or unusable. */
		readonly configFor: (
			organizationId: string,
		) => Effect.Effect<AiConfig | null, DbError>;
		/**
		 * The outcome of a real call (not a test): after several refusals in a
		 * row (401, 402, 403, 429), owners and admins are emailed, at most once
		 * a day.
		 */
		readonly recordCall: (
			organizationId: string,
			outcome: { ok: true } | { ok: false; status?: number },
		) => Effect.Effect<void, DbError>;
	}
>()("tattle/server/AiSettings") {
	static readonly layer = Layer.effect(
		AiSettings,
		Effect.gen(function* () {
			const database = yield* Database;
			const access = yield* Access;
			const notifications = yield* Notifications;

			const load = (organizationId: string) =>
				database
					.query((db) =>
						db
							.select()
							.from(aiSettings)
							.where(eq(aiSettings.organizationId, organizationId)),
					)
					.pipe(Effect.map((rows) => rows[0] ?? null));

			const savedKey = (row: Row) =>
				row.apiKeyEncrypted
					? decryptSecret(row.apiKeyEncrypted, row.organizationId)
					: null;

			// Built field by field: the key, even encrypted, never reaches the browser.
			const toView = (row: Row | null, canManage: boolean): AiSettingsView =>
				row
					? {
							canManage,
							configured: true,
							provider: row.provider,
							baseUrl: row.baseUrl ?? "",
							model: row.model,
							enabled: row.enabled,
							keyLast4: row.apiKeyLast4,
							keyUnreadable:
								row.apiKeyEncrypted !== null && savedKey(row) === null,
							updatedAt: row.updatedAt.toISOString(),
						}
					: {
							canManage,
							configured: false,
							provider: "anthropic",
							baseUrl: "",
							model: AI_PROVIDER_META.anthropic.defaultModel,
							enabled: false,
							keyLast4: null,
							keyUnreadable: false,
							updatedAt: null,
						};

			const view = Effect.fn("AiSettings.view")(function* (
				principal: Principal,
				organizationId: string,
			) {
				yield* access.requireOrganization(principal, organizationId);
				const canManage = yield* access
					.requireAdmin(principal, organizationId)
					.pipe(
						Effect.as(true),
						Effect.catchTag("Forbidden", () => Effect.succeed(false)),
					);
				return toView(yield* load(organizationId), canManage);
			});

			const save = Effect.fn("AiSettings.save")(function* (
				principal: Principal,
				organizationId: string,
				input: AiSettingsInput,
			) {
				yield* access.requireAdmin(principal, organizationId, ADMIN_ONLY);
				const current = yield* load(organizationId);
				const baseUrl = yield* normalizeBaseUrl(input.provider, input.baseUrl);
				const model = yield* normalizeModel(input.provider, input.model);
				const typedKey = input.apiKey?.trim() ?? "";
				if (typedKey.length > 500)
					return yield* new InvalidInput({ message: "That key is too long" });

				// A key belongs to one provider: switching provider drops it.
				let apiKeyEncrypted: string | null = null;
				let apiKeyLast4: string | null = null;
				if (typedKey) {
					apiKeyEncrypted = encryptSecret(typedKey, organizationId);
					apiKeyLast4 = typedKey.slice(-4);
				} else if (current && current.provider === input.provider) {
					apiKeyEncrypted = current.apiKeyEncrypted;
					apiKeyLast4 = current.apiKeyLast4;
				}
				if (input.enabled && needsKey(input.provider) && !apiKeyEncrypted) {
					return yield* new InvalidInput({
						message: `Add your ${AI_PROVIDER_META[input.provider].label} API key to turn suggestions on`,
					});
				}

				const values = {
					provider: input.provider,
					baseUrl,
					model,
					apiKeyEncrypted,
					apiKeyLast4,
					enabled: input.enabled,
					updatedById: principal.kind === "user" ? principal.userId : null,
					// New settings, a fresh start for the refusal count.
					refusedCalls: 0,
					lastRefusedStatus: null,
				};
				const [row] = yield* database.query((db) =>
					db
						.insert(aiSettings)
						.values({ organizationId, ...values })
						.onConflictDoUpdate({
							target: aiSettings.organizationId,
							set: { ...values, updatedAt: new Date() },
						})
						.returning(),
				);
				yield* Effect.logInfo(
					`AI settings of ${organizationId} saved: ${input.provider}, ${model}, ${input.enabled ? "on" : "off"}`,
				);
				return toView(row ?? null, true);
			});

			const remove = Effect.fn("AiSettings.remove")(function* (
				principal: Principal,
				organizationId: string,
			) {
				yield* access.requireAdmin(principal, organizationId, ADMIN_ONLY);
				yield* database.query((db) =>
					db
						.delete(aiSettings)
						.where(eq(aiSettings.organizationId, organizationId)),
				);
			});

			const test = Effect.fn("AiSettings.test")(function* (
				principal: Principal,
				organizationId: string,
				input: Omit<AiSettingsInput, "enabled">,
			) {
				yield* access.requireAdmin(principal, organizationId, ADMIN_ONLY);
				const baseUrl = yield* normalizeBaseUrl(input.provider, input.baseUrl);
				const model = yield* normalizeModel(input.provider, input.model);
				let apiKey = input.apiKey?.trim() || null;
				if (!apiKey) {
					const current = yield* load(organizationId);
					if (current && current.provider === input.provider) {
						apiKey = savedKey(current);
						if (current.apiKeyEncrypted && !apiKey)
							return {
								ok: false,
								error:
									"The saved key can no longer be read (the server secret changed). Enter it again.",
							} satisfies AiTestResult;
					}
				}
				if (!apiKey && needsKey(input.provider))
					return {
						ok: false,
						error: "Enter an API key",
					} satisfies AiTestResult;
				const result = yield* testConnection({
					provider: input.provider,
					baseUrl,
					model,
					apiKey,
				}).pipe(Effect.result);
				return result._tag === "Success"
					? ({ ok: true } satisfies AiTestResult)
					: ({
							ok: false,
							error: result.failure.message,
						} satisfies AiTestResult);
			});

			const configFor = Effect.fn("AiSettings.configFor")(function* (
				organizationId: string,
			) {
				const row = yield* load(organizationId);
				if (!row?.enabled) return null;
				const apiKey = savedKey(row);
				if (row.apiKeyEncrypted && !apiKey) {
					yield* Effect.logWarning(
						`The AI key of ${organizationId} cannot be decrypted (BETTER_AUTH_SECRET changed?): enter it again in Agents & API`,
					);
					return null;
				}
				if (!apiKey && needsKey(row.provider)) return null;
				return {
					provider: row.provider,
					baseUrl: row.baseUrl,
					model: row.model,
					apiKey,
				} satisfies AiConfig;
			});

			// The counters are bookkeeping: "saved at" stays the last real save.
			const keepUpdatedAt = { updatedAt: sql`${aiSettings.updatedAt}` };

			const recordCall = Effect.fn("AiSettings.recordCall")(function* (
				organizationId: string,
				outcome: { ok: true } | { ok: false; status?: number },
			) {
				if (outcome.ok) {
					yield* database.query((db) =>
						db
							.update(aiSettings)
							.set({
								refusedCalls: 0,
								lastRefusedStatus: null,
								...keepUpdatedAt,
							})
							.where(
								and(
									eq(aiSettings.organizationId, organizationId),
									gt(aiSettings.refusedCalls, 0),
								),
							),
					);
					return;
				}
				const status = outcome.status;
				if (!status || !REFUSED_STATUSES.includes(status)) return;
				const [row] = yield* database.query((db) =>
					db
						.update(aiSettings)
						.set({
							refusedCalls: sql`${aiSettings.refusedCalls} + 1`,
							lastRefusedStatus: status,
							...keepUpdatedAt,
						})
						.where(eq(aiSettings.organizationId, organizationId))
						.returning(),
				);
				if (!row || row.refusedCalls < REFUSALS_BEFORE_EMAIL) return;
				const [claimed] = yield* database.query((db) =>
					db
						.update(aiSettings)
						.set({ refusalNotifiedAt: new Date(), ...keepUpdatedAt })
						.where(
							and(
								eq(aiSettings.organizationId, organizationId),
								or(
									isNull(aiSettings.refusalNotifiedAt),
									lt(
										aiSettings.refusalNotifiedAt,
										new Date(Date.now() - 24 * 3600 * 1000),
									),
								),
							),
						)
						.returning(),
				);
				if (!claimed) return;
				yield* Effect.logWarning(
					`The AI provider refused ${row.refusedCalls} calls in a row for ${organizationId} (HTTP ${status}): telling owners and admins`,
				);
				yield* inBackground(
					"AI key email",
					notifications.aiKeyFailing(organizationId, claimed.provider, status),
				);
			});

			return AiSettings.of({
				view,
				save,
				remove,
				test,
				configFor,
				recordCall,
			});
		}),
	);
}
