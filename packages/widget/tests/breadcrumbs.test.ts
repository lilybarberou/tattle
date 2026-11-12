import { afterEach, describe, expect, it } from "vitest";
import {
	addBreadcrumb,
	describeElement,
	describeField,
	type ElementLike,
	getBreadcrumbs,
	pushBreadcrumb,
	uninstallBreadcrumbCollector,
} from "../src/collectors/breadcrumbs";

/** Just enough of an Element for the descriptions. */
const element = (
	tagName: string,
	{
		attributes = {},
		text = "",
		id = "",
		label,
		private: isPrivate = false,
	}: {
		attributes?: Record<string, string>;
		text?: string;
		id?: string;
		label?: string;
		private?: boolean;
	} = {},
): ElementLike => ({
	tagName: tagName.toUpperCase(),
	id,
	textContent: text,
	getAttribute: (name) => attributes[name] ?? null,
	closest: (selector) =>
		isPrivate && selector.includes("data-tattle-mask") ? element("div") : null,
	labels: label === undefined ? [] : [{ textContent: label }],
	ownerDocument: {
		getElementById: (target) =>
			target === "heading" ? { textContent: "  Billing   address " } : null,
	},
});

describe("describeElement", () => {
	it("names a button by its text, a link by its role, and adds the id", () => {
		expect(describeElement(element("button", { text: " Pay\n now " }))).toBe(
			"button “Pay now”",
		);
		expect(
			describeElement(
				element("a", {
					attributes: { href: "/cart" },
					text: "Cart",
					id: "nav",
				}),
			),
		).toBe("link “Cart” #nav");
	});

	it("prefers the accessible name and shortens long text", () => {
		expect(
			describeElement(
				element("div", {
					attributes: { role: "button", "aria-label": "Close dialog" },
					text: "×",
				}),
			),
		).toBe("button “Close dialog”");
		expect(
			describeElement(
				element("section", { attributes: { "aria-labelledby": "heading" } }),
			),
		).toBe("section “Billing address”");
		const long = describeElement(element("button", { text: "x".repeat(80) }));
		expect(long).toBe(`button “${"x".repeat(39)}…”`);
	});

	it("never reads text inside a masked element, nor a field's value", () => {
		expect(
			describeElement(
				element("span", { text: "FR76 3000 6000", private: true }),
			),
		).toBe("span");
		expect(
			describeElement(
				element("input", {
					attributes: { type: "submit", value: "Secret" },
				}),
			),
		).toBe("button");
	});
});

describe("describeField", () => {
	it("gives the label and type of a field, never its value", () => {
		expect(
			describeField(
				element("input", {
					attributes: { type: "email", value: "jo@example.com" },
					label: "Email",
				}),
			),
		).toBe("Changed “Email” (email)");
		expect(
			describeField(element("select", { attributes: { name: "country" } })),
		).toBe("Changed “country” (select)");
		expect(describeField(element("textarea", { id: "notes" }))).toBe(
			"Changed “#notes” (textarea)",
		);
	});

	it("skips passwords, card fields and anything that is not a field", () => {
		expect(
			describeField(
				element("input", {
					attributes: { type: "password" },
					label: "Password",
				}),
			),
		).toBeNull();
		expect(
			describeField(
				element("input", { attributes: { autocomplete: "cc-number" } }),
			),
		).toBeNull();
		expect(describeField(element("button", { text: "Go" }))).toBeNull();
	});
});

describe("the trail", () => {
	afterEach(() => uninstallBreadcrumbCollector());

	it("keeps the 50 most recent steps", () => {
		for (let i = 0; i < 60; i++) pushBreadcrumb("click", `step ${i}`);
		const trail = getBreadcrumbs();
		expect(trail).toHaveLength(50);
		expect(trail[0]?.message).toBe("step 10");
		expect(trail.at(-1)).toMatchObject({
			category: "click",
			message: "step 59",
			timestamp: expect.any(Number),
		});
	});

	it("cleans the steps an app adds", () => {
		addBreadcrumb({
			message: "  Applied   coupon ",
			data: {
				code: "SPRING",
				amount: 10,
				nested: { no: true },
				fn: () => 1,
				long: "y".repeat(300),
			},
		});
		addBreadcrumb({ message: "Opened cart", category: "cart" });
		addBreadcrumb({ message: "   " });
		addBreadcrumb(null as never);
		const trail = getBreadcrumbs();
		expect(trail).toHaveLength(2);
		expect(trail[0]).toMatchObject({
			category: "custom",
			message: "Applied coupon",
			data: { code: "SPRING", amount: 10, long: `${"y".repeat(199)}…` },
		});
		expect(trail[0]?.data).not.toHaveProperty("nested");
		expect(trail[1]).toMatchObject({
			category: "cart",
			message: "Opened cart",
		});
	});
});
