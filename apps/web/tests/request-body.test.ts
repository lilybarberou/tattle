import { describe, expect, it } from "vitest";
import { readLimitedBody, readLimitedJson } from "#/server/request-body";

/** A chunked request (no Content-Length) that sends `chunks` chunks of 1 KB. */
const chunked = (chunks: number) => {
	let pulled = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (pulled >= chunks) return controller.close();
			pulled++;
			controller.enqueue(new Uint8Array(1024).fill(32));
		},
	});
	const request = new Request("http://localhost:3000/api", {
		method: "POST",
		body,
		duplex: "half",
	} as RequestInit);
	return { request, pulled: () => pulled };
};

describe("readLimitedBody", () => {
	it("stops reading a chunked body as soon as it passes the cap", async () => {
		const { request, pulled } = chunked(1_000_000);
		expect(request.headers.get("content-length")).toBeNull();
		expect(await readLimitedBody(request, 10 * 1024)).toEqual({
			ok: false,
			reason: "too_large",
		});
		expect(pulled()).toBeLessThan(20);
	});

	it("refuses a declared Content-Length over the cap without reading", async () => {
		const request = new Request("http://localhost:3000/api", {
			method: "POST",
			body: "x".repeat(2048),
		});
		expect(await readLimitedBody(request, 1024)).toMatchObject({
			ok: false,
			reason: "too_large",
		});
	});

	it("returns a body under the cap, whole", async () => {
		const { request } = chunked(3);
		const read = await readLimitedBody(request, 10 * 1024);
		expect(read.ok && read.bytes.byteLength).toBe(3 * 1024);
	});
});

describe("readLimitedJson", () => {
	it("parses JSON and tells invalid bodies apart from large ones", async () => {
		const json = (body: string) =>
			new Request("http://localhost:3000/api", { method: "POST", body });
		expect(await readLimitedJson(json('{"a":1}'), 100)).toEqual({
			ok: true,
			value: { a: 1 },
		});
		expect(await readLimitedJson(json("nope"), 100)).toEqual({
			ok: false,
			reason: "invalid",
		});
		expect(await readLimitedJson(chunked(50).request, 1024)).toEqual({
			ok: false,
			reason: "too_large",
		});
	});
});
