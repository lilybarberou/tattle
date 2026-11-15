import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uninstallNetworkCollector } from "../src/collectors/network";
import { INTERNAL_MARK } from "../src/internal";
import {
	buildPayload,
	buildReporter,
	IngestError,
	ingestUrl,
	MAX_MESSAGE_LENGTH,
	SDK_NAME,
	sendPayload,
} from "../src/payload";
import {
	fetchReports,
	fetchThread,
	markRead,
	ReporterApiError,
	sendMessage,
} from "../src/reporter";

vi.mock("../src/collectors/device", () => ({
	getDeviceInfo: () => ({ browser: { name: "Firefox", version: "130" } }),
}));

// No network: the page's fetch is a double that records each call.
const fetchMock =
	vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal("window", { fetch: fetchMock });
	vi.stubGlobal("fetch", fetchMock);
	vi.stubGlobal("location", {
		href: "https://shop.example.com/reset?token=abc#access_token=xyz",
	});
	vi.stubGlobal("document", { title: "Checkout" });
	uninstallNetworkCollector();
});
afterEach(() => vi.unstubAllGlobals());

const base = {
	projectKey: "pk_0123",
	type: "bug" as const,
	message: "  It broke  ",
	user: null,
	context: null,
};

describe("buildPayload", () => {
	it("describes the page without its secrets", () => {
		const payload = buildPayload(base);
		expect(payload).toMatchObject({
			projectKey: "pk_0123",
			type: "bug",
			message: "It broke",
			pageUrl:
				"https://shop.example.com/reset?token=[redacted]#access_token=[redacted]",
			pageTitle: "Checkout",
			device: { browser: { name: "Firefox" } },
			console: expect.any(Array),
			network: expect.any(Array),
			breadcrumbs: expect.any(Array),
			sdk: { name: SDK_NAME },
		});
		expect(payload).not.toHaveProperty("reporter");
		expect(payload).not.toHaveProperty("context");
		expect(payload).not.toHaveProperty("userHash");
	});

	it("caps the message and the page title", () => {
		vi.stubGlobal("document", { title: "t".repeat(600) });
		const payload = buildPayload({ ...base, message: "m".repeat(6000) });
		expect(payload.message).toHaveLength(MAX_MESSAGE_LENGTH);
		expect(payload.pageTitle).toHaveLength(500);
	});

	it("keeps the screenshot of a bug only", () => {
		expect(
			buildPayload({ ...base, screenshot: "data:image/png;base64,AA" })
				.screenshot,
		).toBe("data:image/png;base64,AA");
		expect(
			buildPayload({
				...base,
				type: "feature",
				screenshot: "data:image/png;base64,AA",
			}),
		).not.toHaveProperty("screenshot");
	});

	it("sends the identity hash only with a user id, capped", () => {
		const withId = buildPayload({
			...base,
			user: { id: "42", hash: "h".repeat(200) },
		});
		expect(withId.reporter).toEqual({ id: "42" });
		expect(withId.userHash).toHaveLength(128);
		const withoutId = buildPayload({
			...base,
			user: { email: "a@example.com", hash: "abc" },
		});
		expect(withoutId).not.toHaveProperty("userHash");
		expect(JSON.stringify(withoutId)).not.toContain('"abc"');
	});

	it("makes the context plain JSON, whatever it holds", () => {
		const context: Record<string, unknown> = {
			cart: 3n,
			fn: () => 1,
			nested: { ok: true },
		};
		context.self = context;
		const payload = buildPayload({ ...base, context, release: " 1.2.3 " });
		expect(payload.context).toEqual({
			cart: "3",
			nested: { ok: true },
			self: "[Circular]",
		});
		expect(payload.release).toBe("1.2.3");
	});

	it("passes the reporter key along", () => {
		expect(
			buildPayload({ ...base, reporterKey: "k".repeat(43) }).reporterKey,
		).toBe("k".repeat(43));
		expect(buildPayload({ ...base, reporterKey: null })).not.toHaveProperty(
			"reporterKey",
		);
	});
});

describe("buildReporter", () => {
	it("prefers the identified user's email over the typed one", () => {
		expect(
			buildReporter({ email: "me@example.com" }, "typed@example.com"),
		).toEqual({
			email: "me@example.com",
		});
		expect(buildReporter(null, "  typed@example.com ")).toEqual({
			email: "typed@example.com",
		});
		expect(buildReporter(null, "   ")).toBeUndefined();
		expect(buildReporter({ id: "  ", name: "" })).toBeUndefined();
	});

	it("keeps other fields as traits", () => {
		expect(
			buildReporter({ id: "u1", name: "Ada", plan: "pro", seats: 3 }),
		).toEqual({ id: "u1", name: "Ada", traits: { plan: "pro", seats: 3 } });
	});
});

describe("sendPayload", () => {
	it("posts JSON without cookies, marked as the SDK's own request", async () => {
		fetchMock.mockResolvedValue(
			Response.json({ id: "r1", issueNumber: 4 }, { status: 201 }),
		);
		const result = await sendPayload(
			"https://tattle.example.com///",
			buildPayload(base),
		);
		expect(result).toEqual({ id: "r1", issueNumber: 4 });
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://tattle.example.com/api/v1/ingest");
		expect(init).toMatchObject({
			method: "POST",
			credentials: "omit",
			mode: "cors",
			headers: { "Content-Type": "application/json" },
			[INTERNAL_MARK]: true,
		});
		expect(JSON.parse(String(init?.body)).message).toBe("It broke");
	});

	it("throws the server's message and status", async () => {
		fetchMock.mockResolvedValue(
			Response.json({ error: "Too many reports" }, { status: 429 }),
		);
		const error = await sendPayload(
			"https://t.example",
			buildPayload(base),
		).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(IngestError);
		expect(error).toMatchObject({ status: 429, message: "Too many reports" });
	});

	it("throws status 0 when the network fails, and copes with a non-JSON answer", async () => {
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
		await expect(
			sendPayload("https://t.example", buildPayload(base)),
		).rejects.toMatchObject({ status: 0, message: "Failed to fetch" });

		fetchMock.mockResolvedValue(new Response("<html>", { status: 502 }));
		await expect(
			sendPayload("https://t.example", buildPayload(base)),
		).rejects.toMatchObject({ status: 502, message: "" });

		fetchMock.mockResolvedValue(new Response("", { status: 200 }));
		expect(await sendPayload("https://t.example", buildPayload(base))).toEqual({
			id: "",
		});
	});

	it("builds the endpoint from the server URL", () => {
		expect(ingestUrl("https://t.example/")).toBe(
			"https://t.example/api/v1/ingest",
		);
	});
});

describe("the reporter API client", () => {
	const headers = { "x-tattle-project-key": "pk_1" };

	it("reads with GET and writes with POST, escaping the report id", async () => {
		fetchMock.mockImplementation(async () => Response.json({ ok: true }));
		await fetchReports("https://t.example/", headers);
		await fetchThread("https://t.example", headers, "a/b?c");
		await sendMessage("https://t.example", headers, "r1", "Hello");
		await markRead("https://t.example", headers, "r1");
		const calls = fetchMock.mock.calls.map(([url, init]) => [
			url,
			init?.method,
			init?.body,
		]);
		expect(calls).toEqual([
			["https://t.example/api/v1/my-reports", "GET", undefined],
			["https://t.example/api/v1/my-reports/a%2Fb%3Fc", "GET", undefined],
			[
				"https://t.example/api/v1/my-reports/r1/messages",
				"POST",
				'{"body":"Hello"}',
			],
			["https://t.example/api/v1/my-reports/r1/read", "POST", "{}"],
		]);
		for (const [, init] of fetchMock.mock.calls) {
			expect(init?.credentials).toBe("omit");
			expect((init as Record<string, unknown>)[INTERNAL_MARK]).toBe(true);
		}
		expect(fetchMock.mock.calls[2]?.[1]?.headers).toEqual({
			...headers,
			"Content-Type": "application/json",
		});
	});

	it("throws the server's error with its status, or status 0 offline", async () => {
		fetchMock.mockResolvedValue(
			Response.json({ error: "Not found" }, { status: 404 }),
		);
		const error = await fetchThread("https://t.example", headers, "x").catch(
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(ReporterApiError);
		expect(error).toMatchObject({ status: 404, message: "Not found" });

		fetchMock.mockRejectedValue(new Error("offline"));
		await expect(
			fetchReports("https://t.example", headers),
		).rejects.toMatchObject({
			status: 0,
			message: "offline",
		});
	});
});
