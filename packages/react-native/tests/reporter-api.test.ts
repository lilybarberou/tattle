import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// expo-crypto is optional: the test decides whether the app has it.
const optional = vi.hoisted(() => ({
	expo: null as { getRandomBytes(count: number): Uint8Array } | null,
}));
vi.mock("../src/optional", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/optional")>()),
	expoCrypto: () => optional.expo,
}));

const {
	fetchReports,
	fetchThread,
	generateReporterKey,
	markRead,
	myReportsUrl,
	ReporterApiError,
	sendMessage,
} = await import("../src/reporter");

const fetchMock =
	vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	optional.expo = null;
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const bytes = (seed: number) =>
	Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + seed) & 255);

describe("generateReporterKey", () => {
	it("is the base64url of the 32 random bytes", () => {
		for (const seed of [0, 1, 200]) {
			vi.stubGlobal("crypto", {
				getRandomValues: (array: Uint8Array) => {
					array.set(bytes(seed));
					return array;
				},
			});
			expect(generateReporterKey()).toBe(
				Buffer.from(bytes(seed)).toString("base64url"),
			);
		}
	});

	it("uses expo-crypto when there is no Web Crypto, without a warning", () => {
		vi.stubGlobal("crypto", undefined);
		optional.expo = { getRandomBytes: () => bytes(7) };
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(generateReporterKey()).toBe(
			Buffer.from(bytes(7)).toString("base64url"),
		);
		expect(warn).not.toHaveBeenCalled();
	});
});

describe("the reporter API client", () => {
	const headers = { "x-tattle-project-key": "pk_1" };

	it("reads with GET and writes JSON with POST, escaping the report id", async () => {
		fetchMock.mockImplementation(async () => Response.json({ ok: true }));
		await fetchReports("https://t.example//", headers);
		await fetchThread("https://t.example", headers, "a/b?c");
		await sendMessage("https://t.example", headers, "r1", "Hello");
		await markRead("https://t.example", headers, "r1");
		expect(
			fetchMock.mock.calls.map(([url, init]) => [
				url,
				init?.method,
				init?.body,
			]),
		).toEqual([
			["https://t.example/api/v1/my-reports", "GET", undefined],
			["https://t.example/api/v1/my-reports/a%2Fb%3Fc", "GET", undefined],
			[
				"https://t.example/api/v1/my-reports/r1/messages",
				"POST",
				'{"body":"Hello"}',
			],
			["https://t.example/api/v1/my-reports/r1/read", "POST", "{}"],
		]);
		expect(fetchMock.mock.calls[2]?.[1]?.headers).toEqual({
			...headers,
			"Content-Type": "application/json",
		});
		expect(myReportsUrl("https://t.example/")).toBe(
			"https://t.example/api/v1/my-reports",
		);
	});

	it("throws the server's error and status, or status 0 offline", async () => {
		fetchMock.mockResolvedValue(
			Response.json({ error: "Not found" }, { status: 404 }),
		);
		const error = await fetchThread("https://t.example", headers, "x").catch(
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(ReporterApiError);
		expect(error).toMatchObject({ status: 404, message: "Not found" });

		fetchMock.mockResolvedValue(new Response("<html>", { status: 502 }));
		await expect(
			fetchReports("https://t.example", headers),
		).rejects.toMatchObject({ status: 502, message: "" });

		fetchMock.mockRejectedValue(new TypeError("Network request failed"));
		await expect(
			fetchReports("https://t.example", headers),
		).rejects.toMatchObject({ status: 0, message: "Network request failed" });
	});

	it("gives up after 20 seconds", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new Error("Aborted")),
					);
				}),
		);
		const pending = fetchReports("https://t.example", headers).catch(
			(e: unknown) => e,
		);
		await vi.advanceTimersByTimeAsync(19_999);
		expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(await pending).toMatchObject({ status: 0, message: "Aborted" });
	});
});
