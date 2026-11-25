import { afterEach, describe, expect, it } from "vitest";
import {
	applyBeforeSend,
	applyCollection,
	ReportDropped,
} from "../src/collection";
import { addBreadcrumb, getBreadcrumbs } from "../src/collectors/breadcrumbs";
import { getConsoleEntries } from "../src/collectors/console";
import type { IngestPayload } from "../src/types";
import { AppState } from "./react-native-stub";

// Node, with the react-native stub: console and AppState only, nothing sent.

const originalLog = console.log;

afterEach(() => {
	applyCollection({ console: false, network: false, steps: false });
	console.log = originalLog;
});

describe("turning collectors off", () => {
	it("restores the console and forgets what it kept", () => {
		console.log = () => {};
		const quiet = console.log;
		applyCollection(undefined);
		console.log("before the provider: card 4242");
		expect(getConsoleEntries()).toHaveLength(1);
		applyCollection({ console: false });
		expect(getConsoleEntries()).toEqual([]);
		expect(console.log).toBe(quiet);
		console.log("after");
		expect(getConsoleEntries()).toEqual([]);
	});

	it("stops listening to the app going to the background, keeping the app's own steps", () => {
		applyCollection(undefined);
		expect(AppState.listeners.size).toBe(1);
		applyCollection({ steps: false });
		expect(AppState.listeners.size).toBe(0);
		AppState.emit("background");
		addBreadcrumb({ message: "Opened the cart" });
		expect(getBreadcrumbs().map((b) => b.message)).toEqual(["Opened the cart"]);
	});
});

describe("beforeSend", () => {
	const report = (): IngestPayload =>
		({
			projectKey: "pk_0123456789abcdef0123456789abcdef",
			type: "bug",
			message: "Paid twice, jo@example.com",
			screenshot: "data:image/png;base64,AAAA",
			pageUrl: "Checkout",
			device: {},
			console: [],
			network: [],
			breadcrumbs: [],
			sdk: { name: "@tattle/react-native", version: "0.2.0" },
		}) as unknown as IngestPayload;

	it("sends what it returns, from a copy, and keeps the project", async () => {
		const original = report();
		const sent = await applyBeforeSend(original, (r) => {
			delete r.screenshot;
			return { ...r, projectKey: "pk_ffffffffffffffffffffffffffffffff" };
		});
		expect(sent.screenshot).toBeUndefined();
		expect(sent.projectKey).toBe(original.projectKey);
		expect(original.screenshot).toBeDefined();
	});

	it("drops the report on null or when it throws", async () => {
		await expect(applyBeforeSend(report(), () => null)).rejects.toBeInstanceOf(
			ReportDropped,
		);
		await expect(
			applyBeforeSend(report(), async () => {
				throw new Error("hook failed");
			}),
		).rejects.toBeInstanceOf(ReportDropped);
	});
});
