import { randomUUID } from "node:crypto";
import { Effect, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Storage } from "#/server/Storage";

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (value: Uint8Array) => new TextDecoder().decode(value);

/** The same behaviour is expected from the local disk and from S3. */
const storageContract = (
	makeRuntime: () => ManagedRuntime.ManagedRuntime<Storage, never>,
) => {
	let runtime: ManagedRuntime.ManagedRuntime<Storage, never>;
	beforeAll(() => {
		runtime = makeRuntime();
	});
	afterAll(() => runtime.dispose());

	const use = <A, E>(f: (storage: Storage["Service"]) => Effect.Effect<A, E>) =>
		runtime.runPromise(Storage.use(f));
	const failure = <A, E>(
		f: (storage: Storage["Service"]) => Effect.Effect<A, E>,
	) => runtime.runPromise(Effect.flip(Storage.use(f)));
	const prefix = `${randomUUID()}/`;

	it("puts and gets a file", async () => {
		await use((s) => s.put(`${prefix}reports/a.png`, bytes("hello")));
		expect(text(await use((s) => s.get(`${prefix}reports/a.png`)))).toBe(
			"hello",
		);
	});

	it("overwrites a file with the same key", async () => {
		await use((s) => s.put(`${prefix}reports/b.png`, bytes("one")));
		await use((s) => s.put(`${prefix}reports/b.png`, bytes("two")));
		expect(text(await use((s) => s.get(`${prefix}reports/b.png`)))).toBe("two");
	});

	it("answers NotFound for a missing file", async () => {
		expect((await failure((s) => s.get(`${prefix}missing.png`)))._tag).toBe(
			"NotFound",
		);
	});

	it("removes files, and removing nothing or a missing file is fine", async () => {
		await use((s) => s.put(`${prefix}c.png`, bytes("c")));
		await use((s) => s.put(`${prefix}d.png`, bytes("d")));
		await use((s) => s.remove([`${prefix}c.png`, `${prefix}missing.png`]));
		await use((s) => s.remove([]));
		expect((await failure((s) => s.get(`${prefix}c.png`)))._tag).toBe(
			"NotFound",
		);
		expect(text(await use((s) => s.get(`${prefix}d.png`)))).toBe("d");
	});

	it("removes every file under a prefix and nothing else", async () => {
		const other = `${randomUUID()}/`;
		await use((s) => s.put(`${prefix}p/reports/1.png`, bytes("1")));
		await use((s) => s.put(`${prefix}p/reports/2.webp`, bytes("2")));
		await use((s) => s.put(`${other}reports/3.png`, bytes("3")));
		await use((s) => s.removePrefix(`${prefix}p/`));
		expect((await failure((s) => s.get(`${prefix}p/reports/1.png`)))._tag).toBe(
			"NotFound",
		);
		expect(
			(await failure((s) => s.get(`${prefix}p/reports/2.webp`)))._tag,
		).toBe("NotFound");
		expect(text(await use((s) => s.get(`${other}reports/3.png`)))).toBe("3");
		await use((s) => s.removePrefix(other));
	});

	afterAll(async () => {
		await runtime.runPromise(Storage.use((s) => s.removePrefix(prefix)));
	});
};

describe("local storage", () => {
	storageContract(() => ManagedRuntime.make(Storage.layer));

	it("refuses keys that escape the storage folder", async () => {
		const runtime = ManagedRuntime.make(Storage.layer);
		const error = await runtime.runPromise(
			Effect.flip(Storage.use((s) => s.put("../escape.png", bytes("x")))),
		);
		expect(error._tag).toBe("StorageError");
		await runtime.dispose();
	});
});

describe("signed URLs", () => {
	const runtime = ManagedRuntime.make(Storage.layer);
	afterAll(() => runtime.dispose());
	const storage = () => runtime.runPromise(Storage.use(Effect.succeed));

	const parse = (url: string) => {
		const parsed = new URL(url);
		return {
			origin: parsed.origin,
			path: parsed.pathname,
			key: parsed.searchParams.get("key") ?? "",
			exp: Number(parsed.searchParams.get("exp")),
			sig: parsed.searchParams.get("sig") ?? "",
		};
	};

	it("point to the files API and verify", async () => {
		const s = await storage();
		const url = parse(s.signedUrl("p1/reports/r1.png", 60));
		expect(url).toMatchObject({
			origin: "http://localhost:3000",
			path: "/api/v1/files",
			key: "p1/reports/r1.png",
		});
		expect(url.exp - Date.now() / 1000).toBeGreaterThan(55);
		expect(s.verify(url.key, url.exp, url.sig)).toBe(true);
	});

	it("fail once expired", async () => {
		const s = await storage();
		vi.useFakeTimers();
		try {
			const url = parse(s.signedUrl("p1/reports/r1.png", 60));
			vi.advanceTimersByTime(61_000);
			expect(s.verify(url.key, url.exp, url.sig)).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("fail when tampered with", async () => {
		const s = await storage();
		const url = parse(s.signedUrl("p1/reports/r1.png", 60));
		expect(s.verify("p2/reports/r1.png", url.exp, url.sig)).toBe(false);
		expect(s.verify(url.key, url.exp + 3600, url.sig)).toBe(false);
		expect(s.verify(url.key, url.exp, `${url.sig.slice(0, -1)}A`)).toBe(false);
		expect(s.verify(url.key, url.exp, "")).toBe(false);
		expect(s.verify(url.key, Number.NaN, url.sig)).toBe(false);
	});
});

// Runs only against a real bucket, e.g. RustFS from docker-compose.dev.yml:
// S3_ENDPOINT=http://localhost:9030 S3_BUCKET=tattle-test S3_ACCESS_KEY_ID=tattle
// S3_SECRET_ACCESS_KEY=tattle-secret S3_FORCE_PATH_STYLE=true pnpm test
describe.skipIf(!process.env.S3_ENDPOINT)("S3 storage", () => {
	const prefix = `test-${randomUUID()}/`;
	beforeAll(() => {
		vi.stubEnv("STORAGE_DRIVER", "s3");
		vi.stubEnv("S3_PREFIX", prefix);
	});
	afterAll(() => {
		vi.unstubAllEnvs();
	});

	storageContract(() => ManagedRuntime.make(Storage.layer));
});
