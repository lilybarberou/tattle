import { Effect, ManagedRuntime } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Storage } from "#/server/Storage";

// A fake S3 client: no network. Each command is recorded, and `answer`
// decides what the bucket replies.
const s3 = vi.hoisted(() => ({
	sent: [] as { command: string; input: Record<string, unknown> }[],
	config: null as Record<string, unknown> | null,
	answer: (_command: string, _input: Record<string, unknown>): unknown => ({}),
}));

vi.mock("@aws-sdk/client-s3", () => {
	const command = (name: string) =>
		class {
			readonly name = name;
			constructor(readonly input: Record<string, unknown>) {}
		};
	return {
		S3Client: class {
			constructor(config: Record<string, unknown>) {
				s3.config = config;
			}
			async send(cmd: { name: string; input: Record<string, unknown> }) {
				s3.sent.push({ command: cmd.name, input: cmd.input });
				return s3.answer(cmd.name, cmd.input);
			}
		},
		PutObjectCommand: command("Put"),
		GetObjectCommand: command("Get"),
		DeleteObjectsCommand: command("Delete"),
		ListObjectsV2Command: command("List"),
	};
});

let runtime: ManagedRuntime.ManagedRuntime<Storage, never>;
const use = <A, E>(f: (storage: Storage["Service"]) => Effect.Effect<A, E>) =>
	runtime.runPromise(Storage.use(f));
const failure = <A, E>(
	f: (storage: Storage["Service"]) => Effect.Effect<A, E>,
) => runtime.runPromise(Effect.flip(Storage.use(f)));

beforeEach(() => {
	s3.sent.length = 0;
	s3.answer = () => ({});
	vi.stubEnv("STORAGE_DRIVER", "s3");
	vi.stubEnv("S3_BUCKET", "tattle-bucket");
	vi.stubEnv("S3_PREFIX", "prod/");
	vi.stubEnv("S3_REGION", "eu-west-3");
	vi.stubEnv("S3_ENDPOINT", "https://s3.example.invalid");
	vi.stubEnv("S3_FORCE_PATH_STYLE", "true");
	vi.stubEnv("S3_ACCESS_KEY_ID", "key-id");
	vi.stubEnv("S3_SECRET_ACCESS_KEY", "key-secret");
	runtime = ManagedRuntime.make(Storage.layer);
});
afterEach(async () => {
	await runtime.dispose();
	vi.unstubAllEnvs();
});

describe("the S3 backend", () => {
	it("is configured from the environment", async () => {
		await use((s) => s.put("a.png", new Uint8Array([1])));
		expect(s3.config).toMatchObject({
			region: "eu-west-3",
			endpoint: "https://s3.example.invalid",
			forcePathStyle: true,
			credentials: { accessKeyId: "key-id", secretAccessKey: "key-secret" },
		});
	});

	it("needs S3_BUCKET", async () => {
		await runtime.dispose();
		vi.stubEnv("S3_BUCKET", "");
		runtime = ManagedRuntime.make(Storage.layer);
		await expect(use((s) => Effect.succeed(s))).rejects.toThrow(
			"S3_BUCKET is not set",
		);
	});

	it("puts files under the prefix with their content type", async () => {
		await use((s) => s.put("p1/r1/shot.webp", new Uint8Array([1, 2])));
		await use((s) => s.put("p1/r1/shot.jpg", new Uint8Array([1])));
		await use((s) => s.put("p1/r1/blob", new Uint8Array([1])));
		expect(s3.sent.map((c) => [c.input.Key, c.input.ContentType])).toEqual([
			["prod/p1/r1/shot.webp", "image/webp"],
			["prod/p1/r1/shot.jpg", "image/jpeg"],
			["prod/p1/r1/blob", "application/octet-stream"],
		]);
		expect(s3.sent[0]?.input.Bucket).toBe("tattle-bucket");
	});

	it("gets a file's bytes, and NotFound when the bucket fails or is empty", async () => {
		s3.answer = () => ({
			Body: { transformToByteArray: async () => new Uint8Array([7, 8]) },
		});
		expect(await use((s) => s.get("x.png"))).toEqual(new Uint8Array([7, 8]));
		expect(s3.sent[0]?.input.Key).toBe("prod/x.png");

		s3.answer = () => ({});
		expect((await failure((s) => s.get("x.png")))._tag).toBe("NotFound");
		s3.answer = () => {
			throw new Error("NoSuchKey");
		};
		expect((await failure((s) => s.get("x.png")))._tag).toBe("NotFound");
	});

	it("deletes in batches of 1,000 keys", async () => {
		const keys = Array.from({ length: 2_345 }, (_, i) => `k${i}.png`);
		await use((s) => s.remove(keys));
		const deletes = s3.sent.filter((c) => c.command === "Delete");
		const sizes = deletes.map(
			(c) => (c.input.Delete as { Objects: unknown[] }).Objects.length,
		);
		expect(sizes).toEqual([1000, 1000, 345]);
		const first = (deletes[0]?.input.Delete as { Objects: { Key: string }[] })
			.Objects[0];
		expect(first?.Key).toBe("prod/k0.png");
		expect((deletes[0]?.input.Delete as { Quiet: boolean }).Quiet).toBe(true);
	});

	it("sends nothing for no keys", async () => {
		await use((s) => s.remove([]));
		expect(s3.sent).toEqual([]);
	});

	it("fails when the bucket could not delete some files, naming only their codes", async () => {
		s3.answer = () => ({
			Errors: [
				{ Key: "prod/a.png", Code: "AccessDenied" },
				{ Key: "prod/b.png", Code: "AccessDenied" },
				{ Key: "prod/c.png" },
			],
		});
		const error = await failure((s) => s.remove(["a.png", "b.png", "c.png"]));
		expect(error._tag).toBe("StorageError");
		expect(error.message).toContain(
			"3 of 3 files could not be deleted (AccessDenied, unknown)",
		);
		expect(error.message).not.toContain("prod/a.png");
	});

	it("removes a prefix page by page", async () => {
		s3.answer = (command, input) => {
			if (command !== "List") return {};
			return input.ContinuationToken === undefined
				? {
						Contents: [{ Key: "prod/p1/a.png" }, { Key: "prod/p1/b.png" }, {}],
						IsTruncated: true,
						NextContinuationToken: "page-2",
					}
				: {
						Contents: [{ Key: "prod/p1/c.png" }],
						IsTruncated: false,
					};
		};
		await use((s) => s.removePrefix("p1/"));
		const lists = s3.sent.filter((c) => c.command === "List");
		expect(lists.map((c) => c.input.Prefix)).toEqual(["prod/p1/", "prod/p1/"]);
		expect(lists[1]?.input.ContinuationToken).toBe("page-2");
		const deleted = s3.sent
			.filter((c) => c.command === "Delete")
			.flatMap((c) =>
				(c.input.Delete as { Objects: { Key: string }[] }).Objects.map(
					(o) => o.Key,
				),
			);
		// Listed keys already carry the prefix: it is not added twice.
		expect(deleted).toEqual([
			"prod/p1/a.png",
			"prod/p1/b.png",
			"prod/p1/c.png",
		]);
	});

	it("stops removing a prefix when a page could not be deleted", async () => {
		s3.answer = (command) =>
			command === "List"
				? {
						Contents: [{ Key: "prod/p1/a.png" }],
						IsTruncated: true,
						NextContinuationToken: "2",
					}
				: { Errors: [{ Code: "SlowDown" }] };
		const error = await failure((s) => s.removePrefix("p1/"));
		expect(error._tag).toBe("StorageError");
		expect(s3.sent.filter((c) => c.command === "List")).toHaveLength(1);
	});
});
