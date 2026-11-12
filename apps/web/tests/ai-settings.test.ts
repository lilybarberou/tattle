import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { aiSettings } from "#/db/schema";
import type { Principal } from "#/server/Access";
import { AiSettings, type AiSettingsInput } from "#/server/AiSettings";
import { type AiConfig, complete, decryptSecret } from "#/server/ai";
import { createOrganization, createPrincipal } from "./helpers/factories";
import { run, runFailure, setupTestDatabase } from "./helpers/runtime";

setupTestDatabase();

const KEY = "sk-ant-api03-SECRET-abcdefgh-wxyz";

const view = (p: Principal, organizationId: string) =>
	run(AiSettings.use((s) => s.view(p, organizationId)));
const save = (p: Principal, organizationId: string, input: AiSettingsInput) =>
	run(AiSettings.use((s) => s.save(p, organizationId, input)));
const saveFailure = (
	p: Principal,
	organizationId: string,
	input: AiSettingsInput,
) => runFailure(AiSettings.use((s) => s.save(p, organizationId, input)));
const test = (
	p: Principal,
	organizationId: string,
	input: Omit<AiSettingsInput, "enabled">,
) => run(AiSettings.use((s) => s.test(p, organizationId, input)));

const savedRow = async (organizationId: string) => {
	const [row] = await db
		.select()
		.from(aiSettings)
		.where(eq(aiSettings.organizationId, organizationId));
	return row;
};

const mockFetch = (status: number, body: unknown) =>
	vi
		.spyOn(globalThis, "fetch")
		.mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => {
	vi.restoreAllMocks();
});

describe("AiSettings", () => {
	it("is off with Anthropic's cheap model until someone sets it up", async () => {
		const org = await createOrganization();
		const owner = await createPrincipal(org.id);
		expect(await view(owner, org.id)).toMatchObject({
			canManage: true,
			configured: false,
			provider: "anthropic",
			model: "claude-haiku-5-5",
			enabled: false,
			keyLast4: null,
		});
	});

	it("stores the key encrypted and never returns it, only its last 4 characters", async () => {
		const org = await createOrganization();
		const owner = await createPrincipal(org.id);
		const saved = await save(owner, org.id, {
			provider: "anthropic",
			apiKey: `  ${KEY}  `,
			enabled: true,
		});
		const row = await savedRow(org.id);
		expect(row?.apiKeyEncrypted).toBeTruthy();
		expect(row?.apiKeyEncrypted).not.toContain("SECRET");
		expect(decryptSecret(row?.apiKeyEncrypted ?? "", org.id)).toBe(KEY);

		const seen = await view(owner, org.id);
		for (const dto of [saved, seen]) {
			const json = JSON.stringify(dto);
			expect(json).not.toContain("SECRET");
			expect(json).not.toContain(row?.apiKeyEncrypted ?? "-");
			expect(dto).toMatchObject({
				configured: true,
				enabled: true,
				keyLast4: "wxyz",
				keyUnreadable: false,
			});
			expect(Object.keys(dto)).not.toContain("apiKeyEncrypted");
		}
	});

	it("keeps the saved key when none is typed, and drops it when the provider changes", async () => {
		const org = await createOrganization();
		const owner = await createPrincipal(org.id);
		await save(owner, org.id, {
			provider: "anthropic",
			apiKey: KEY,
			enabled: true,
		});
		await save(owner, org.id, {
			provider: "anthropic",
			model: "claude-sonnet-5-5",
			apiKey: "",
			enabled: true,
		});
		expect(
			decryptSecret((await savedRow(org.id))?.apiKeyEncrypted ?? "", org.id),
		).toBe(KEY);

		const error = await saveFailure(owner, org.id, {
			provider: "openai",
			enabled: true,
		});
		expect(error).toMatchObject({
			_tag: "InvalidInput",
			message: "Add your OpenAI API key to turn suggestions on",
		});
		const off = await save(owner, org.id, {
			provider: "openai",
			enabled: false,
		});
		expect(off).toMatchObject({ model: "gpt-5-mini", keyLast4: null });
	});

	it("needs a base URL for an OpenAI-compatible server, but no key", async () => {
		const org = await createOrganization();
		const owner = await createPrincipal(org.id);
		expect(
			await saveFailure(owner, org.id, {
				provider: "openai_compatible",
				baseUrl: "ftp://nope",
				model: "llama3.2",
				enabled: true,
			}),
		).toMatchObject({ _tag: "InvalidInput" });
		expect(
			await saveFailure(owner, org.id, {
				provider: "openai_compatible",
				baseUrl: "http://203.0.113.10:11434/v1",
				enabled: true,
			}),
		).toMatchObject({ message: "Enter the model to use" });
		const saved = await save(owner, org.id, {
			provider: "openai_compatible",
			baseUrl: "http://203.0.113.10:11434/v1/",
			model: "llama3.2",
			enabled: true,
		});
		expect(saved).toMatchObject({
			baseUrl: "http://203.0.113.10:11434/v1",
			enabled: true,
			keyLast4: null,
		});
	});

	it("tells when the server secret changed and the key must be entered again", async () => {
		const org = await createOrganization();
		const owner = await createPrincipal(org.id);
		await save(owner, org.id, {
			provider: "anthropic",
			apiKey: KEY,
			enabled: true,
		});
		const secret = process.env.BETTER_AUTH_SECRET;
		process.env.BETTER_AUTH_SECRET = "a-brand-new-secret-of-at-least-32-chars";
		try {
			expect(await view(owner, org.id)).toMatchObject({ keyUnreadable: true });
			expect(await run(AiSettings.use((s) => s.configFor(org.id)))).toBeNull();
		} finally {
			process.env.BETTER_AUTH_SECRET = secret;
		}
	});

	describe("permissions", () => {
		it("lets members see the settings but only owners and admins change or test them", async () => {
			const org = await createOrganization();
			const owner = await createPrincipal(org.id, "owner");
			const admin = await createPrincipal(org.id, "admin");
			const memberP = await createPrincipal(org.id, "member");
			await save(owner, org.id, {
				provider: "anthropic",
				apiKey: KEY,
				enabled: true,
			});

			expect(await view(memberP, org.id)).toMatchObject({
				canManage: false,
				enabled: true,
				keyLast4: "wxyz",
			});
			const denied = { _tag: "Forbidden" };
			expect(
				await saveFailure(memberP, org.id, {
					provider: "anthropic",
					enabled: false,
				}),
			).toMatchObject(denied);
			expect(
				await runFailure(
					AiSettings.use((s) =>
						s.test(memberP, org.id, { provider: "anthropic" }),
					),
				),
			).toMatchObject(denied);
			expect(
				await runFailure(AiSettings.use((s) => s.remove(memberP, org.id))),
			).toMatchObject(denied);

			expect(await view(admin, org.id)).toMatchObject({ canManage: true });
			await run(AiSettings.use((s) => s.remove(admin, org.id)));
			expect(await savedRow(org.id)).toBeUndefined();
		});

		it("refuses API tokens and people from other workspaces", async () => {
			const org = await createOrganization();
			const other = await createOrganization();
			const outsider = await createPrincipal(other.id, "owner");
			const token: Principal = {
				kind: "token",
				tokenId: "token-1",
				name: "Bot",
				organizationIds: [org.id],
				canWrite: true,
			};
			expect(
				await runFailure(AiSettings.use((s) => s.view(outsider, org.id))),
			).toMatchObject({ _tag: "Forbidden" });
			expect(
				await saveFailure(outsider, org.id, {
					provider: "anthropic",
					enabled: false,
				}),
			).toMatchObject({ _tag: "Forbidden" });
			expect(
				await saveFailure(token, org.id, {
					provider: "anthropic",
					enabled: false,
				}),
			).toMatchObject({ _tag: "Forbidden" });
			expect(await view(token, org.id)).toMatchObject({ canManage: false });
		});
	});

	describe("test", () => {
		it("makes one small call with the typed key and reports success", async () => {
			const org = await createOrganization();
			const owner = await createPrincipal(org.id);
			const fetchMock = mockFetch(200, {
				content: [{ type: "text", text: "ok" }],
				stop_reason: "end_turn",
			});
			expect(
				await test(owner, org.id, { provider: "anthropic", apiKey: KEY }),
			).toEqual({ ok: true });
			expect(fetchMock).toHaveBeenCalledOnce();
			const [url, init] = fetchMock.mock.calls[0] ?? [];
			expect(url).toBe("https://api.anthropic.com/v1/messages");
			const headers = init?.headers as Record<string, string>;
			expect(headers["x-api-key"]).toBe(KEY);
			expect(headers["anthropic-version"]).toBe("2026-10-21");
			const body = JSON.parse(String(init?.body));
			expect(body).toMatchObject({ model: "claude-haiku-5-5" });
			expect(body.max_tokens).toBeLessThanOrEqual(256);
			expect(init?.signal).toBeInstanceOf(AbortSignal);
		});

		it("uses the saved key when none is typed", async () => {
			const org = await createOrganization();
			const owner = await createPrincipal(org.id);
			await save(owner, org.id, {
				provider: "openai",
				apiKey: KEY,
				enabled: false,
			});
			const fetchMock = mockFetch(200, {
				choices: [{ message: { content: "ok" } }],
			});
			expect(await test(owner, org.id, { provider: "openai" })).toEqual({
				ok: true,
			});
			const [url, init] = fetchMock.mock.calls[0] ?? [];
			expect(url).toBe("https://api.openai.com/v1/chat/completions");
			expect((init?.headers as Record<string, string>).authorization).toBe(
				`Bearer ${KEY}`,
			);
		});

		it("reports the kind of error and its status, never what the provider said", async () => {
			const org = await createOrganization();
			const owner = await createPrincipal(org.id);
			mockFetch(401, {
				error: { message: `Incorrect API key provided: ${KEY}` },
			});
			const result = await test(owner, org.id, {
				provider: "anthropic",
				apiKey: KEY,
			});
			expect(result).toEqual({
				ok: false,
				error: "HTTP 401: The provider refused the key",
				kind: "unauthorized",
				status: 401,
			});
		});

		it("keeps the body of any answer away from the browser", async () => {
			const org = await createOrganization();
			const owner = await createPrincipal(org.id);
			const input = {
				provider: "openai_compatible" as const,
				baseUrl: "http://203.0.113.10/v1",
				model: "llama3.2",
			};
			vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
				new Response("<h1>Internal admin page</h1>", { status: 500 }),
			);
			const failed = await test(owner, org.id, input);
			expect(failed).toMatchObject({ kind: "http_error", status: 500 });
			expect(JSON.stringify(failed)).not.toContain("admin");

			vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
				new Response("<h1>Internal admin page</h1>", { status: 200 }),
			);
			const unreadable = await test(owner, org.id, input);
			expect(unreadable).toMatchObject({ kind: "bad_response" });
			expect(JSON.stringify(unreadable)).not.toContain("admin");

			for (const [status, kind] of [
				[402, "quota"],
				[429, "quota"],
				[403, "unauthorized"],
				[404, "not_found"],
			] as const) {
				vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
					new Response("secret", { status }),
				);
				expect(await test(owner, org.id, input)).toMatchObject({
					kind,
					status,
				});
			}
		});

		it("reports an unreachable server without the network error's text", async () => {
			const org = await createOrganization();
			const owner = await createPrincipal(org.id);
			vi.spyOn(globalThis, "fetch").mockRejectedValue(
				new TypeError("connect ECONNREFUSED 203.0.113.10:1"),
			);
			const result = await test(owner, org.id, {
				provider: "openai_compatible",
				baseUrl: "http://203.0.113.10:1/v1",
				model: "llama3.2",
			});
			expect(result).toEqual({
				ok: false,
				error: "Could not reach the provider",
				kind: "unreachable",
			});
		});

		it("refuses redirects", async () => {
			const org = await createOrganization();
			const owner = await createPrincipal(org.id);
			const fetchMock = mockFetch(200, {
				choices: [{ message: { content: "ok" } }],
			});
			await test(owner, org.id, {
				provider: "openai_compatible",
				baseUrl: "http://203.0.113.10/v1",
				model: "llama3.2",
			});
			expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("error");
		});
	});

	describe("private addresses", () => {
		const allowPrivate = (value: string | undefined) => {
			delete process.env.AI_ALLOW_PRIVATE_URLS;
			if (value === undefined) delete process.env.ALLOW_PRIVATE_URLS;
			else process.env.ALLOW_PRIVATE_URLS = value;
		};
		afterEach(() => allowPrivate(undefined));

		const compatible = (baseUrl: string) => ({
			provider: "openai_compatible" as const,
			baseUrl,
			model: "llama3.2",
			enabled: true,
		});

		it("refuses base URLs on this machine or a private network", async () => {
			const org = await createOrganization();
			const owner = await createPrincipal(org.id);
			const fetchMock = mockFetch(200, {
				choices: [{ message: { content: "ok" } }],
			});
			for (const baseUrl of [
				"http://localhost:11434/v1",
				"http://127.0.0.1:11434/v1",
				"http://2130706433/v1",
				"http://0.0.0.0/v1",
				"http://[::1]/v1",
				"http://[::]/v1",
				"http://[::ffff:127.0.0.1]/v1",
				"http://[::ffff:a9fe:a9fe]/v1",
				"http://169.254.169.254/latest",
				"http://10.0.0.5/v1",
				"http://172.20.1.1/v1",
				"http://192.168.1.10/v1",
				"http://[fd12:3456::1]/v1",
				"http://[fe80::1]/v1",
			]) {
				const error = await saveFailure(owner, org.id, compatible(baseUrl));
				expect(error, baseUrl).toMatchObject({ _tag: "InvalidInput" });
				expect(error.message).toContain("ALLOW_PRIVATE_URLS=true");
				expect(
					await runFailure(
						AiSettings.use((s) => s.test(owner, org.id, compatible(baseUrl))),
					),
				).toMatchObject({ _tag: "InvalidInput" });
			}
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("allows them with ALLOW_PRIVATE_URLS=true", async () => {
			allowPrivate("true");
			const org = await createOrganization();
			const owner = await createPrincipal(org.id);
			const fetchMock = mockFetch(200, {
				choices: [{ message: { content: "ok" } }],
			});
			await save(owner, org.id, compatible("http://localhost:11434/v1"));
			expect(
				await test(owner, org.id, compatible("http://localhost:11434/v1")),
			).toEqual({ ok: true });
			expect(fetchMock.mock.calls[0]?.[0]).toBe(
				"http://localhost:11434/v1/chat/completions",
			);
		});

		it("checks the address again right before each call", async () => {
			allowPrivate("true");
			const org = await createOrganization();
			const owner = await createPrincipal(org.id);
			await save(owner, org.id, compatible("http://localhost:11434/v1"));
			allowPrivate(undefined);
			const fetchMock = mockFetch(200, {
				choices: [{ message: { content: "ok" } }],
			});
			const config = await run(AiSettings.use((s) => s.configFor(org.id)));
			expect(config).not.toBeNull();
			const error = await runFailure(
				complete(config as AiConfig, {
					system: "s",
					user: "u",
					maxTokens: 10,
				}),
			);
			expect(error).toMatchObject({ _tag: "AiError", kind: "private_address" });
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});
});
