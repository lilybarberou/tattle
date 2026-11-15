import { useSyncExternalStore } from "react";

// Dates and times the dashboard shows depend on the reader's clock and time
// zone. Pages are rendered on the server first, in the server's time zone and
// at the server's time, then hydrated in the browser: any text that differs
// between the two breaks hydration (React error #418). So the server, and the
// browser while it hydrates, render a stable text, the same everywhere (UTC);
// the reader's own text replaces it right after. Pages rendered in the browser
// (client-side navigation) show the reader's text at once.

const subscribe = () => () => {};

/** False on the server and while React hydrates the page, true afterwards. */
export function useHydrated() {
	return useSyncExternalStore(
		subscribe,
		() => true,
		() => false,
	);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "5 minutes ago", "in 3 days". Depends on the clock: use <RelativeTime>. */
export function relativeTime(iso: string, now = Date.now()) {
	const seconds = (new Date(iso).getTime() - now) / 1000;
	const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
		["year", 31536000],
		["month", 2592000],
		["week", 604800],
		["day", 86400],
		["hour", 3600],
		["minute", 60],
	];
	for (const [unit, size] of units) {
		if (Math.abs(seconds) >= size)
			return rtf.format(Math.round(seconds / size), unit);
	}
	return "just now";
}

const monthDay = new Intl.DateTimeFormat("en", {
	month: "short",
	day: "numeric",
});
const utcMonthDay = new Intl.DateTimeFormat("en", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});
const utcDate = new Intl.DateTimeFormat("en", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

/** "9 min", "3 h", "Yesterday", "Nov 3" for dense rows. Depends on the clock: use <ShortTime>. */
export function shortTime(iso: string, now = Date.now()) {
	const date = new Date(iso);
	const minutes = Math.round((now - date.getTime()) / 60000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h`;
	if (hours < 48) return "Yesterday";
	return monthDay.format(date);
}

const isValid = (date: Date) => !Number.isNaN(date.getTime());

/** A <time> whose text is stable until hydration, then the reader's own. */
function Time({
	date,
	stable,
	local,
}: {
	date: Date;
	stable: (date: Date) => string;
	local: (date: Date) => string;
}) {
	const hydrated = useHydrated();
	if (!isValid(date)) return <time>—</time>;
	return (
		<time dateTime={date.toISOString()}>
			{hydrated ? local(date) : stable(date)}
		</time>
	);
}

/** "2 hours ago"; "Nov 15, 2026" (UTC) until the page is hydrated. */
export function RelativeTime({ iso }: { iso: string }) {
	return (
		<Time
			date={new Date(iso)}
			stable={(d) => utcDate.format(d)}
			local={() => relativeTime(iso)}
		/>
	);
}

/** "9 min", "Yesterday", "Nov 3"; "Nov 3" (UTC) until the page is hydrated. */
export function ShortTime({ iso }: { iso: string }) {
	return (
		<Time
			date={new Date(iso)}
			stable={(d) => utcMonthDay.format(d)}
			local={() => shortTime(iso)}
		/>
	);
}

/** "Nov 3" in the reader's time zone; in UTC until the page is hydrated. */
export function MonthDay({ iso }: { iso: string }) {
	return (
		<Time
			date={new Date(iso)}
			stable={(d) => utcMonthDay.format(d)}
			local={(d) => monthDay.format(d)}
		/>
	);
}

/** "14:03:05" in the reader's time zone; in UTC until the page is hydrated. */
export function ClockTime({ timestamp }: { timestamp: number }) {
	return (
		<Time
			date={new Date(timestamp)}
			stable={(d) => d.toISOString().slice(11, 19)}
			local={(d) => d.toLocaleTimeString("en-GB")}
		/>
	);
}
