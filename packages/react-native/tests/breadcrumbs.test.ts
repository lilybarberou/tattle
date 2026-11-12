import { afterEach, describe, expect, it } from "vitest";
import {
	addBreadcrumb,
	getBreadcrumbs,
	installBreadcrumbCollector,
	pushBreadcrumb,
	uninstallBreadcrumbCollector,
} from "../src/collectors/breadcrumbs";
import { setScreen, trackNavigation } from "../src/navigation";
import { buildPayload } from "../src/payload";
import { state } from "../src/state";
// The same module the SDK gets for "react-native" (see vitest.config.ts).
import { AppState } from "./react-native-stub";

afterEach(() => {
	uninstallBreadcrumbCollector();
	state.screen = "";
});

describe("the trail", () => {
	it("keeps the 50 most recent steps and goes out with the report", () => {
		for (let i = 0; i < 60; i++) pushBreadcrumb("custom", `step ${i}`);
		expect(getBreadcrumbs()).toHaveLength(50);
		const payload = buildPayload({
			projectKey: "pk_test",
			type: "bug",
			message: "Hi",
			user: null,
			context: null,
			screen: "",
		});
		expect(payload.breadcrumbs[0]?.message).toBe("step 10");
		expect(payload.breadcrumbs.at(-1)).toMatchObject({
			category: "custom",
			message: "step 59",
			timestamp: expect.any(Number),
		});
	});

	it("cleans the steps an app adds", () => {
		addBreadcrumb({
			message: " Applied  coupon ",
			category: "cart",
			data: { code: "SPRING", nested: { no: true }, total: 12.5 },
		});
		addBreadcrumb({ message: "" });
		expect(getBreadcrumbs()).toEqual([
			{
				category: "cart",
				message: "Applied coupon",
				timestamp: expect.any(Number),
				data: { code: "SPRING", total: 12.5 },
			},
		]);
	});

	it("records the moves between foreground and background", () => {
		installBreadcrumbCollector();
		AppState.emit("inactive");
		AppState.emit("background");
		AppState.emit("active");
		expect(getBreadcrumbs().map((b) => [b.category, b.message])).toEqual([
			["app", "Left the app"],
			["app", "Came back to the app"],
		]);
	});
});

describe("screens", () => {
	it("records each new screen once", () => {
		setScreen("Home");
		setScreen("Home");
		setScreen("Cart");
		setScreen(null);
		expect(getBreadcrumbs().map((b) => b.message)).toEqual(["Home", "Cart"]);
	});

	it("follows a React Navigation container ref", () => {
		let route = { name: "Home" };
		const listeners: Array<() => void> = [];
		const ref = {
			current: null,
			getCurrentRoute: () => route,
			addListener: (_event: "state", listener: () => void) => {
				listeners.push(listener);
				return () => listeners.splice(listeners.indexOf(listener), 1);
			},
		};
		const stop = trackNavigation(ref);
		route = { name: "Checkout" };
		for (const listener of listeners) listener();
		expect(state.screen).toBe("Checkout");
		stop();
		expect(listeners).toHaveLength(0);
		expect(getBreadcrumbs().map((b) => b.message)).toEqual([
			"Home",
			"Checkout",
		]);
		expect(trackNavigation({ current: null })()).toBeUndefined();
	});
});
