import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Effect, Exit } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AiConfig, complete } from "#/server/ai";
import { checkUrlHost } from "#/server/private-address";
import { publicOnlyDispatcher } from "#/server/public-request";

// Everything here stays on this machine: the "provider" listens on 127.0.0.1,
// and "localhost" resolves from the hosts file.

// The check made before the call is stubbed to say "public", as it would for
// a name that answers a public address first and 127.0.0.1 a moment later
// (DNS rebinding). Only the check on the connection itself is left to refuse.
vi.mock("#/server/private-address", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("#/server/private-address")>();
	return { ...original, checkUrlHost: vi.fn(original.checkUrlHost) };
});

let closers: Array<() => Promise<void>> = [];
afterEach(async () => {
	await Promise.all(closers.map((close) => close()));
	closers = [];
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

/** A local OpenAI-compatible server that answers "ok" to every request. */
const startProvider = async () => {
	const requests: string[] = [];
	const server = createServer((req, res) => {
		requests.push(req.url ?? "");
		req.resume();
		req.on("end", () => {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	closers.push(
		() =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	);
	return { port, requests };
};

const compatible = (port: number): AiConfig => ({
	provider: "openai_compatible",
	baseUrl: `http://localhost:${port}/v1`,
	model: "local-model",
	apiKey: "sk-local-secret",
});

const prompt = { system: "s", user: "u", maxTokens: 16 };

const failureKind = async (config: AiConfig) => {
	const exit = await Effect.runPromiseExit(complete(config, prompt, 5_000));
	if (Exit.isSuccess(exit)) return "succeeded";
	const error = exit.cause.reasons[0];
	return error && "error" in error
		? (error.error as { kind: string }).kind
		: "defect";
};

describe("calling an OpenAI-compatible base URL", () => {
	it("refuses, on the connection itself, a name that now resolves to this machine", async () => {
		vi.mocked(checkUrlHost).mockResolvedValueOnce("public");
		const provider = await startProvider();
		expect(await failureKind(compatible(provider.port))).toBe(
			"private_address",
		);
		expect(checkUrlHost).toHaveBeenCalledOnce();
		// Nothing reached the address: neither the prompt nor the key.
		expect(provider.requests).toEqual([]);
	});

	it("reaches the same server once private addresses are allowed", async () => {
		vi.stubEnv("ALLOW_PRIVATE_URLS", "true");
		const provider = await startProvider();
		const text = await Effect.runPromise(
			complete(compatible(provider.port), prompt, 5_000),
		);
		expect(text).toBe("ok");
		expect(provider.requests).toEqual(["/v1/chat/completions"]);
		expect(checkUrlHost).not.toHaveBeenCalled();
	});

	it("still refuses a private IP literal before any connection", async () => {
		const provider = await startProvider();
		const config = {
			...compatible(provider.port),
			baseUrl: `http://127.0.0.1:${provider.port}/v1`,
		};
		expect(await failureKind(config)).toBe("private_address");
		expect(provider.requests).toEqual([]);
	});

	it("uses the checked dispatcher for a typed base URL only", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(
				async () =>
					new Response(
						JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
						{ status: 200 },
					),
			);
		vi.mocked(checkUrlHost).mockResolvedValueOnce("public");
		await Effect.runPromise(
			complete(
				{ ...compatible(1), baseUrl: "https://llm.example.test/v1" },
				prompt,
			),
		);
		await Effect.runPromise(
			complete(
				{ provider: "openai", baseUrl: null, model: "m", apiKey: "k" },
				prompt,
			),
		);
		const dispatchers = fetchMock.mock.calls.map(
			([, init]) => (init as { dispatcher?: unknown } | undefined)?.dispatcher,
		);
		expect(dispatchers).toEqual([publicOnlyDispatcher(), undefined]);
	});
});
