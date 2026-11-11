import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { Context, Effect, Layer } from "effect";
import { env } from "./env";
import { NotFound, StorageError } from "./errors";

type Backend = {
	readonly put: (
		key: string,
		bytes: Uint8Array,
		contentType: string,
	) => Promise<void>;
	readonly get: (key: string) => Promise<Uint8Array>;
	readonly remove: (keys: ReadonlyArray<string>) => Promise<void>;
	readonly removePrefix: (prefix: string) => Promise<void>;
};

/** Files under STORAGE_DIR on the server's disk (the default). */
const localBackend = (): Backend => {
	const root = resolve(env.storageDir);
	const pathFor = (key: string) => {
		const path = resolve(root, key);
		if (!path.startsWith(root + sep)) throw new Error("Invalid key");
		return path;
	};
	return {
		put: async (key, bytes) => {
			const path = pathFor(key);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, bytes);
		},
		get: (key) => readFile(pathFor(key)),
		remove: async (keys) => {
			await Promise.all(keys.map((key) => rm(pathFor(key), { force: true })));
		},
		removePrefix: async (prefix) => {
			await rm(pathFor(prefix.replace(/\/$/, "")), {
				recursive: true,
				force: true,
			});
		},
	};
};

/**
 * Any S3-compatible bucket: AWS S3, Cloudflare R2, Scaleway, OVH, MinIO…
 * The bucket stays private; files are served through /api/v1/files.
 */
const s3Backend = (): Backend => {
	const bucket = process.env.S3_BUCKET;
	if (!bucket) throw new Error("S3_BUCKET is not set");
	const client = new S3Client({
		region: process.env.S3_REGION ?? "us-east-1",
		endpoint: process.env.S3_ENDPOINT || undefined,
		forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
		credentials:
			process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
				? {
						accessKeyId: process.env.S3_ACCESS_KEY_ID,
						secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
					}
				: undefined,
	});
	const prefixed = (key: string) => `${process.env.S3_PREFIX ?? ""}${key}`;
	const removeKeys = async (keys: ReadonlyArray<string>) => {
		for (let i = 0; i < keys.length; i += 1000) {
			const batch = keys.slice(i, i + 1000);
			if (batch.length === 0) continue;
			await client.send(
				new DeleteObjectsCommand({
					Bucket: bucket,
					Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
				}),
			);
		}
	};
	return {
		put: async (key, bytes, contentType) => {
			await client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: prefixed(key),
					Body: bytes,
					ContentType: contentType,
				}),
			);
		},
		get: async (key) => {
			const result = await client.send(
				new GetObjectCommand({ Bucket: bucket, Key: prefixed(key) }),
			);
			if (!result.Body) throw new Error("Empty object");
			return result.Body.transformToByteArray();
		},
		remove: (keys) => removeKeys(keys.map(prefixed)),
		removePrefix: async (prefix) => {
			let token: string | undefined;
			do {
				const page = await client.send(
					new ListObjectsV2Command({
						Bucket: bucket,
						Prefix: prefixed(prefix),
						ContinuationToken: token,
					}),
				);
				await removeKeys(
					(page.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : [])),
				);
				token = page.IsTruncated ? page.NextContinuationToken : undefined;
			} while (token);
		},
	};
};

export const storageDriver = () =>
	process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";

const contentTypeFor = (key: string) =>
	key.endsWith(".png")
		? "image/png"
		: key.endsWith(".webp")
			? "image/webp"
			: key.endsWith(".jpg")
				? "image/jpeg"
				: "application/octet-stream";

/** Screenshots and other files. STORAGE_DRIVER picks the disk or an S3 bucket. */
export class Storage extends Context.Service<
	Storage,
	{
		readonly put: (
			key: string,
			bytes: Uint8Array,
		) => Effect.Effect<void, StorageError>;
		readonly get: (key: string) => Effect.Effect<Uint8Array, NotFound>;
		readonly remove: (
			keys: ReadonlyArray<string>,
		) => Effect.Effect<void, StorageError>;
		/** Deletes every file whose key starts with `prefix` (e.g. a whole project). */
		readonly removePrefix: (
			prefix: string,
		) => Effect.Effect<void, StorageError>;
		/** Absolute URL valid for `ttlSeconds`, served by /api/v1/files. */
		readonly signedUrl: (key: string, ttlSeconds?: number) => string;
		readonly verify: (
			key: string,
			expires: number,
			signature: string,
		) => boolean;
	}
>()("tattle/server/Storage") {
	static readonly layer = Layer.effect(
		Storage,
		Effect.sync(() => {
			const backend = storageDriver() === "s3" ? s3Backend() : localBackend();
			const sign = (key: string, expires: number) =>
				createHmac("sha256", env.secret)
					.update(`${key}:${expires}`)
					.digest("base64url");
			const failure = (action: string) => (cause: unknown) =>
				new StorageError({ message: `Could not ${action}: ${cause}` });

			return Storage.of({
				put: (key, bytes) =>
					Effect.tryPromise({
						try: () => backend.put(key, bytes, contentTypeFor(key)),
						catch: failure(`write ${key}`),
					}),
				get: (key) =>
					Effect.tryPromise({
						try: () => backend.get(key),
						catch: () => new NotFound({ message: "File not found" }),
					}),
				remove: (keys) =>
					keys.length === 0
						? Effect.void
						: Effect.tryPromise({
								try: () => backend.remove(keys),
								catch: failure("delete files"),
							}),
				removePrefix: (prefix) =>
					Effect.tryPromise({
						try: () => backend.removePrefix(prefix),
						catch: failure(`delete ${prefix}`),
					}),
				signedUrl: (key, ttlSeconds = 3600) => {
					const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
					const params = new URLSearchParams({
						key,
						exp: String(expires),
						sig: sign(key, expires),
					});
					return `${env.baseUrl}/api/v1/files?${params}`;
				},
				verify: (key, expires, signature) => {
					if (!Number.isFinite(expires) || expires < Date.now() / 1000)
						return false;
					const expected = Buffer.from(sign(key, expires));
					const given = Buffer.from(signature);
					return (
						expected.length === given.length && timingSafeEqual(expected, given)
					);
				},
			});
		}),
	);
}
