import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ClockTime,
	MonthDay,
	RelativeTime,
	relativeTime,
	ShortTime,
	shortTime,
} from "#/components/time";

// 23:30 UTC: already the next day in Paris, Tokyo or Auckland.
const LATE = "2026-11-12T23:30:05.000Z";

afterEach(() => {
	vi.useRealTimers();
});

describe("dates rendered on the server", () => {
	// Hydration compares this text with the browser's first render, which
	// renders the same server snapshot: it must not depend on the server's
	// time zone or clock.
	it("render in UTC, whatever the clock", () => {
		vi.useFakeTimers({ now: new Date("2026-11-15T12:00:00Z") });
		const html = [
			renderToString(<ClockTime timestamp={Date.parse(LATE)} />),
			renderToString(<MonthDay iso={LATE} />),
			renderToString(<ShortTime iso={LATE} />),
			renderToString(<RelativeTime iso={LATE} />),
		];
		vi.setSystemTime(new Date("2027-03-01T08:00:00Z"));
		expect(
			[
				renderToString(<ClockTime timestamp={Date.parse(LATE)} />),
				renderToString(<MonthDay iso={LATE} />),
				renderToString(<ShortTime iso={LATE} />),
				renderToString(<RelativeTime iso={LATE} />),
			],
			"the same text later on",
		).toEqual(html);
		expect(html).toEqual([
			`<time dateTime="${LATE}">23:30:05</time>`,
			`<time dateTime="${LATE}">Nov 12</time>`,
			`<time dateTime="${LATE}">Nov 12</time>`,
			`<time dateTime="${LATE}">Nov 12, 2026</time>`,
		]);
	});

	it("show a dash for a timestamp that is not a date", () => {
		expect(renderToString(<ClockTime timestamp={8.65e15} />)).toBe(
			"<time>—</time>",
		);
		expect(renderToString(<RelativeTime iso="not a date" />)).toBe(
			"<time>—</time>",
		);
	});
});

describe("the reader's own text", () => {
	const now = Date.parse("2026-11-15T12:00:00Z");

	it("relativeTime", () => {
		expect(relativeTime("2026-11-15T11:59:30Z", now)).toBe("just now");
		expect(relativeTime("2026-11-15T10:00:00Z", now)).toBe("2 hours ago");
		expect(relativeTime("2026-11-18T12:00:00Z", now)).toBe("in 3 days");
	});

	it("shortTime", () => {
		expect(shortTime("2026-11-15T11:59:50Z", now)).toBe("now");
		expect(shortTime("2026-11-15T11:51:00Z", now)).toBe("9 min");
		expect(shortTime("2026-11-15T09:00:00Z", now)).toBe("3 h");
		expect(shortTime("2026-11-14T06:00:00Z", now)).toBe("Yesterday");
	});
});
