import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { runtime } from "#/server/runtime";
import { Storage } from "#/server/Storage";

const contentTypes: Record<string, string> = {
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
};

// Serves stored files through short-lived signed URLs (see Storage.signedUrl).
export const Route = createFileRoute("/api/v1/files")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const key = url.searchParams.get("key") ?? "";
				const expires = Number(url.searchParams.get("exp"));
				const signature = url.searchParams.get("sig") ?? "";
				const result = await runtime.runPromise(
					Effect.gen(function* () {
						const storage = yield* Storage;
						if (!storage.verify(key, expires, signature)) return null;
						return yield* storage
							.get(key)
							.pipe(Effect.orElseSucceed(() => null));
					}),
				);
				if (!result) return new Response("Not found", { status: 404 });
				const extension = key.split(".").pop() ?? "";
				return new Response(result as Uint8Array<ArrayBuffer>, {
					headers: {
						"content-type":
							contentTypes[extension] ?? "application/octet-stream",
						"cache-control": "private, max-age=3600",
						"x-content-type-options": "nosniff",
					},
				});
			},
		},
	},
});
