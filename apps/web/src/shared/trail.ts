// The steps before a report, interleaved with its errors and failed requests:
// what the dashboard shows as one timeline and what agents read through MCP.
// Shared by the server and the browser: keep it free of server-only imports.

type Breadcrumb = {
	category: string;
	message: string;
	timestamp: number;
	data?: { [key: string]: string | number | boolean | null };
};
type ConsoleEntry = {
	level: string;
	message: string;
	timestamp: number;
	stack?: string;
};
type NetworkEntry = {
	method: string;
	url: string;
	status: number;
	durationMs: number;
	timestamp: number;
	error?: string;
};

export type TrailItem =
	| ({ kind: "step" } & Breadcrumb)
	| { kind: "error"; timestamp: number; message: string }
	| {
			kind: "request";
			timestamp: number;
			method: string;
			url: string;
			status: number;
			error?: string;
	  };

export const isFailedRequest = (entry: { status: number }) =>
	entry.status === 0 || entry.status >= 400;

/** Oldest first; on the same millisecond, the step comes before what it caused. */
export const buildTrail = (report: {
	breadcrumbs: ReadonlyArray<Breadcrumb>;
	console: ReadonlyArray<ConsoleEntry>;
	network: ReadonlyArray<NetworkEntry>;
}): TrailItem[] =>
	[
		...report.breadcrumbs.map((b): TrailItem => ({ kind: "step", ...b })),
		...report.console
			.filter((c) => c.level === "error")
			.map(
				(c): TrailItem => ({
					kind: "error",
					timestamp: c.timestamp,
					message: c.message,
				}),
			),
		...report.network.filter(isFailedRequest).map(
			(n): TrailItem => ({
				kind: "request",
				timestamp: n.timestamp,
				method: n.method,
				url: n.url,
				status: n.status,
				error: n.error,
			}),
		),
	].sort((a, b) => a.timestamp - b.timestamp);

const shorten = (value: string, max: number) => {
	const line = value.replace(/\s+/g, " ").trim();
	return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** "14:03:05", in UTC so every reader gets the same time. */
const clock = (timestamp: number) =>
	Math.abs(timestamp) <= 8.64e15
		? new Date(timestamp).toISOString().slice(11, 19)
		: "--:--:--";

/** One line per item, e.g. `14:03:05 click: button “Pay now”`. */
export const trailLine = (item: TrailItem) => {
	const at = clock(item.timestamp);
	if (item.kind === "error")
		return `${at} console error: ${shorten(item.message, 300)}`;
	if (item.kind === "request")
		return `${at} failed request: ${item.method} ${shorten(item.url, 200)} → ${item.status || item.error || "no response"}`;
	const data = item.data
		? ` (${Object.entries(item.data)
				.map(([key, value]) => `${key}: ${value}`)
				.join(", ")})`
		: "";
	return `${at} ${item.category}: ${item.message}${data}`;
};
