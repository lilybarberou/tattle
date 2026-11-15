import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import { lenient } from "#/lib/search-params";

// The shapes of the dashboard's search parameters (issues list, triage,
// requests), parsed as the router hands them over.
const issues = z.object({
	view: lenient(z.enum(["open", "progress", "done", "closed"])),
	q: lenient(z.string()),
});
const triage = z.object({ selected: lenient(z.int()) });
const requests = z.object({ shipped: lenient(z.boolean()) });

describe("lenient search parameters", () => {
	it("keep the values a page knows", () => {
		expect(issues.parse({ view: "done", q: "checkout" })).toEqual({
			view: "done",
			q: "checkout",
		});
		expect(triage.parse({ selected: 12 })).toEqual({ selected: 12 });
		expect(requests.parse({ shipped: true })).toEqual({ shipped: true });
		expect(issues.parse({})).toEqual({});
	});

	it("drop the others instead of failing the page", () => {
		expect(issues.parse({ view: "bogus", q: 404 })).toEqual({
			view: undefined,
			q: undefined,
		});
		expect(triage.parse({ selected: "abc" })).toEqual({ selected: undefined });
		expect(triage.parse({ selected: 1.5 })).toEqual({ selected: undefined });
		expect(requests.parse({ shipped: "yes" })).toEqual({ shipped: undefined });
	});
});
