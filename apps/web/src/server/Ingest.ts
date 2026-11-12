import { eq } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";
import { type JsonObject, project, type Reporter, report } from "#/db/schema";
import { Database } from "./Database";
import {
	type DbError,
	InvalidInput,
	NotFound,
	type StorageError,
} from "./errors";
import { type IssueDto, Issues } from "./Issues";
import { Storage } from "./Storage";
import { Webhooks } from "./Webhooks";

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

const Text = (max: number) => Schema.String.check(Schema.isMaxLength(max));
const JsonRecord = Schema.Record(Schema.String, Schema.Unknown);

// Contract shared with packages/widget (see its README).
export const IngestPayload = Schema.Struct({
	projectKey: Text(100),
	type: Schema.Literals(["bug", "feature"]),
	message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(5000)),
	screenshot: Schema.optional(Schema.String),
	pageUrl: Text(4000),
	pageTitle: Schema.optional(Text(500)),
	reporter: Schema.optional(
		Schema.Struct({
			id: Schema.optional(Text(200)),
			email: Schema.optional(Text(320)),
			name: Schema.optional(Text(200)),
			traits: Schema.optional(JsonRecord),
		}),
	),
	context: Schema.optional(JsonRecord),
	device: JsonRecord,
	console: Schema.Array(
		Schema.Struct({
			level: Schema.Literals(["log", "info", "warn", "error", "debug"]),
			message: Text(10_000),
			timestamp: Schema.Number,
			stack: Schema.optional(Text(10_000)),
		}),
	).check(Schema.isMaxLength(500)),
	network: Schema.Array(
		Schema.Struct({
			method: Text(20),
			url: Text(4000),
			status: Schema.Number,
			durationMs: Schema.Number,
			timestamp: Schema.Number,
			error: Schema.optional(Text(2000)),
		}),
	).check(Schema.isMaxLength(300)),
	sdk: Schema.optional(Schema.Struct({ name: Text(100), version: Text(50) })),
});
export type IngestPayload = typeof IngestPayload.Type;

const decodePayload = Schema.decodeUnknownEffect(IngestPayload);

const parseDataUrl = (dataUrl: string) => {
	const match = dataUrl.match(
		/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
	);
	if (!match) return null;
	const [, format, base64] = match as unknown as [
		string,
		"png" | "jpeg" | "webp",
		string,
	];
	const bytes = Buffer.from(base64, "base64");
	return { extension: format === "jpeg" ? "jpg" : format, bytes };
};

/**
 * The allowed origins stop other websites from sending reports with this key
 * from their visitors' browsers. Browsers always send `Origin` on these
 * requests and pages cannot change it. Mobile apps and servers send none, and
 * could send any value anyway, so a missing `Origin` is accepted: refusing it
 * would only shut out native apps, not anyone abusing the key.
 */
export const originAllowed = (
	allowedOrigins: ReadonlyArray<string>,
	origin: string | null,
) =>
	origin === null ||
	allowedOrigins.length === 0 ||
	allowedOrigins.some((allowed) => allowed === origin || allowed === "*");

export class Ingest extends Context.Service<
	Ingest,
	{
		readonly submit: (
			input: unknown,
			origin: string | null,
		) => Effect.Effect<
			{ id: string; issueNumber: number },
			InvalidInput | NotFound | DbError | StorageError
		>;
		/** Allowed origins for a public key, used to answer CORS preflights. */
		readonly allowedOrigins: (
			projectKey: string,
		) => Effect.Effect<ReadonlyArray<string> | null, DbError>;
	}
>()("tattle/server/Ingest") {
	static readonly layer = Layer.effect(
		Ingest,
		Effect.gen(function* () {
			const database = yield* Database;
			const storage = yield* Storage;
			const issues = yield* Issues;
			const webhooks = yield* Webhooks;

			const findProject = (publicKey: string) =>
				database
					.query((db) =>
						db.select().from(project).where(eq(project.publicKey, publicKey)),
					)
					.pipe(Effect.map((rows) => rows[0] ?? null));

			const submit = Effect.fn("Ingest.submit")(function* (
				input: unknown,
				origin: string | null,
			) {
				const payload = yield* decodePayload(input).pipe(
					Effect.mapError(
						(error) => new InvalidInput({ message: error.message }),
					),
				);
				const target = yield* findProject(payload.projectKey);
				if (!target)
					return yield* new NotFound({ message: "Unknown project key" });
				if (!originAllowed(target.allowedOrigins, origin)) {
					return yield* new InvalidInput({
						message: "This origin is not allowed for this project",
					});
				}

				const reportId = crypto.randomUUID();
				let screenshotKey: string | null = null;
				if (payload.screenshot) {
					const image = parseDataUrl(payload.screenshot);
					if (!image)
						return yield* new InvalidInput({
							message: "Screenshot must be a PNG, JPEG or WebP data URL",
						});
					if (image.bytes.byteLength > MAX_SCREENSHOT_BYTES) {
						return yield* new InvalidInput({
							message: "Screenshot is larger than 8 MB",
						});
					}
					screenshotKey = `${target.id}/reports/${reportId}.${image.extension}`;
					yield* storage.put(screenshotKey, image.bytes);
				}

				const [row] = yield* database.query((db) =>
					db
						.insert(report)
						.values({
							id: reportId,
							projectId: target.id,
							type: payload.type,
							message: payload.message.trim(),
							screenshotKey,
							pageUrl: payload.pageUrl,
							pageTitle: payload.pageTitle ?? null,
							reporter: (payload.reporter as Reporter | undefined) ?? null,
							context: (payload.context as JsonObject | undefined) ?? null,
							device: payload.device as JsonObject,
							console: [...payload.console],
							network: [...payload.network],
							sdk: payload.sdk ?? null,
							origin,
						})
						.returning(),
				);
				if (!row)
					return yield* new InvalidInput({
						message: "Report could not be saved",
					});

				const created: IssueDto = yield* issues.createFromReport(
					target.id,
					row,
				);
				yield* webhooks.emit(target.id, "report.created", {
					report: {
						id: row.id,
						type: row.type,
						message: row.message,
						pageUrl: row.pageUrl,
						reporter: row.reporter,
						hasScreenshot: screenshotKey !== null,
						consoleErrors: row.console.filter((c) => c.level === "error")
							.length,
						failedRequests: row.network.filter(
							(n) => n.status === 0 || n.status >= 400,
						).length,
						createdAt: row.createdAt.toISOString(),
					},
					issue: created,
				});
				return { id: row.id, issueNumber: created.number };
			});

			const allowedOrigins = (projectKey: string) =>
				findProject(projectKey).pipe(
					Effect.map((p) => (p ? p.allowedOrigins : null)),
				);

			return Ingest.of({ submit, allowedOrigins });
		}),
	);
}
