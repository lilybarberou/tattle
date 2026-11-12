// Public endpoints (ingest, "My reports", the GitHub webhook) cap the size of
// what they read. Content-Length alone is not enough: a chunked body has
// none, and `request.arrayBuffer()` or `request.json()` would buffer all of it.

export type LimitedBody =
	| { ok: true; bytes: Uint8Array }
	| { ok: false; reason: "too_large" | "unreadable" };

/**
 * The request's body, read as a stream and abandoned as soon as it passes
 * `maxBytes` (or when Content-Length already says it will).
 */
export const readLimitedBody = async (
	request: Request,
	maxBytes: number,
): Promise<LimitedBody> => {
	const declared = request.headers.get("content-length");
	if (declared !== null && Number(declared) > maxBytes) {
		await request.body?.cancel().catch(() => {});
		return { ok: false, reason: "too_large" };
	}
	if (!request.body) return { ok: true, bytes: new Uint8Array() };
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		let next: ReadableStreamReadResult<Uint8Array>;
		try {
			next = await reader.read();
		} catch {
			// The client went away mid-body.
			return { ok: false, reason: "unreadable" };
		}
		const { done, value } = next;
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel().catch(() => {});
			return { ok: false, reason: "too_large" };
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return { ok: true, bytes };
};

/** Same, parsed as JSON: "invalid" when it is not. */
export const readLimitedJson = async (
	request: Request,
	maxBytes: number,
): Promise<
	{ ok: true; value: unknown } | { ok: false; reason: "too_large" | "invalid" }
> => {
	const body = await readLimitedBody(request, maxBytes);
	if (!body.ok)
		return {
			ok: false,
			reason: body.reason === "too_large" ? "too_large" : "invalid",
		};
	try {
		return {
			ok: true,
			value: JSON.parse(new TextDecoder().decode(body.bytes)),
		};
	} catch {
		return { ok: false, reason: "invalid" };
	}
};
