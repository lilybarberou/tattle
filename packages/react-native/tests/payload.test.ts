import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getConsoleEntries,
	installConsoleCollector,
	uninstallConsoleCollector,
} from "../src/collectors/console";
import { getDeviceInfo } from "../src/collectors/device";
import {
	buildPayload,
	buildReporter,
	IngestError,
	ingestUrl,
	sendPayload,
} from "../src/payload";
import { redactUrl } from "../src/redact";
// The same module the SDK gets for "react-native" (see vitest.config.ts).
import { Platform } from "./react-native-stub";

describe("buildReporter", () => {
	it("splits id, email and name from traits and keeps a typed email as fallback", () => {
		expect(
			buildReporter(
				{ id: " 42 ", email: " jo@example.com ", plan: "pro" },
				"x@y.z",
			),
		).toEqual({ id: "42", email: "jo@example.com", traits: { plan: "pro" } });
		expect(buildReporter(null, " typed@example.com ")).toEqual({
			email: "typed@example.com",
		});
		expect(buildReporter(null)).toBeUndefined();
	});
});

describe("getDeviceInfo", () => {
	beforeEach(() => {
		Platform.OS = "ios";
		Platform.Version = "18.2";
		Platform.constants = {
			systemName: "iOS",
			osVersion: "18.2",
			interfaceIdiom: "phone",
			reactNativeVersion: { major: 0, minor: 88, patch: 1, prerelease: null },
		};
	});

	it("describes an iPhone", () => {
		const device = getDeviceInfo({
			name: "Shop",
			version: "1.4.2",
			build: "87",
		});
		expect(device).toMatchObject({
			platform: "ios",
			os: { name: "iOS", version: "18.2" },
			manufacturer: "Apple",
			deviceType: "phone",
			app: { name: "Shop", version: "1.4.2", build: "87" },
			runtime: { reactNative: "0.88.1", hermes: false },
			screen: { width: 393, height: 852, pixelRatio: 3, fontScale: 1.1 },
			viewport: { width: 393, height: 800 },
			colorScheme: "dark",
		});
	});

	it("describes an Android phone from its platform constants", () => {
		Platform.OS = "android";
		Platform.Version = 35;
		Platform.constants = {
			Release: "15",
			Model: "Pixel 9",
			Manufacturer: "Google",
			uiMode: "normal",
		};
		expect(getDeviceInfo()).toMatchObject({
			platform: "android",
			os: { name: "Android", version: "15" },
			model: "Pixel 9",
			manufacturer: "Google",
			deviceType: "phone",
		});
		expect(getDeviceInfo().app).toBeUndefined();
	});
});

describe("buildPayload", () => {
	beforeEach(() => installConsoleCollector());
	afterEach(() => uninstallConsoleCollector());

	it("sends the screen as pageUrl and drops the screenshot of an idea", () => {
		console.warn("low stock", { sku: 12 });
		const input = {
			projectKey: "pk_test",
			message: "  Checkout is stuck  ",
			screenshot: "data:image/jpeg;base64,AAAA",
			user: { id: "u1", name: "Jo" },
			context: { cart: 3 },
			screen: "Checkout",
		};
		const bug = buildPayload({ ...input, type: "bug" });
		expect(bug).toMatchObject({
			projectKey: "pk_test",
			type: "bug",
			message: "Checkout is stuck",
			pageUrl: "Checkout",
			screenshot: "data:image/jpeg;base64,AAAA",
			reporter: { id: "u1", name: "Jo" },
			context: { cart: 3 },
			sdk: { name: "@tattle/react-native", version: "0.1.0" },
		});
		expect(bug.console.at(-1)).toMatchObject({
			level: "warn",
			message: 'low stock {"sku":12}',
		});
		expect(
			buildPayload({ ...input, type: "feature" }).screenshot,
		).toBeUndefined();
	});
});

describe("console collector", () => {
	afterEach(() => uninstallConsoleCollector());

	it("records uncaught errors and still calls the app's handler", () => {
		const previous = vi.fn();
		let handler: ((error: unknown, isFatal?: boolean) => void) | undefined =
			previous;
		const errorUtils = {
			getGlobalHandler: () => handler,
			setGlobalHandler: (next: typeof handler) => {
				handler = next;
			},
		};
		(globalThis as { ErrorUtils?: unknown }).ErrorUtils = errorUtils;
		installConsoleCollector();

		const error = new TypeError("undefined is not a function");
		handler?.(error, true);

		expect(previous).toHaveBeenCalledWith(error, true);
		expect(getConsoleEntries().at(-1)).toMatchObject({
			level: "error",
			message: "Fatal: TypeError: undefined is not a function",
		});
		uninstallConsoleCollector();
		expect(handler).toBe(previous);
		delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
	});
});

describe("sendPayload", () => {
	afterEach(() => vi.unstubAllGlobals());

	const payload = () =>
		buildPayload({
			projectKey: "pk_test",
			type: "bug",
			message: "Hi",
			user: null,
			context: null,
			screen: "",
		});

	it("posts JSON to the ingest endpoint", async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({ id: "r1", issueNumber: 4 }, { status: 201 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		await expect(
			sendPayload("https://tattle.example.com/", payload()),
		).resolves.toEqual({ id: "r1", issueNumber: 4 });
		expect(fetchMock).toHaveBeenCalledWith(
			"https://tattle.example.com/api/v1/ingest",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("turns server errors and network failures into IngestError", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({ error: "Unknown project key" }, { status: 404 }),
			),
		);
		await expect(sendPayload("https://t.example", payload())).rejects.toEqual(
			new IngestError("Unknown project key", 404),
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Network request failed");
			}),
		);
		await expect(
			sendPayload("https://t.example", payload()),
		).rejects.toMatchObject({ status: 0 });
	});
});

describe("helpers", () => {
	it("builds the ingest URL and redacts secrets in URLs", () => {
		expect(ingestUrl("https://t.example//")).toBe(
			"https://t.example/api/v1/ingest",
		);
		expect(redactUrl("https://api.example.com/me?token=abc&page=2")).toBe(
			"https://api.example.com/me?token=[redacted]&page=2",
		);
	});
});
