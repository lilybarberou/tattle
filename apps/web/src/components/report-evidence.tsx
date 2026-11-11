import { ExternalLinkIcon, ImageOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "#/lib/utils";
import type { ReportDto } from "#/server/Issues";
import { Face, relativeTime } from "./issue-meta";

// Loads an image through fetch(). In development, Nitro hands requests made by
// <img> (sec-fetch-dest: image) to Vite's static file server instead of the app
// routes, so a plain <img src> to /api/v1/files would 404.
function useFetchedImage(url: string | null) {
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		setObjectUrl(null);
		setFailed(false);
		if (!url) return;
		let cancelled = false;
		let created: string | null = null;
		fetch(url)
			.then((response) => (response.ok ? response.blob() : null))
			.then((blob) => {
				if (cancelled) return;
				if (!blob) return setFailed(true);
				created = URL.createObjectURL(blob);
				setObjectUrl(created);
			})
			.catch(() => !cancelled && setFailed(true));
		return () => {
			cancelled = true;
			if (created) URL.revokeObjectURL(created);
		};
	}, [url]);
	return { objectUrl, failed };
}

const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const record = (value: unknown) =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

export const deviceSummary = (device: ReportDto["device"]) => {
	const browser = record(device.browser);
	const os = record(device.os);
	const viewport = record(device.viewport);
	return {
		browser: browser
			? `${str(browser.name) ?? ""} ${str(browser.version)?.split(".")[0] ?? ""}`.trim()
			: undefined,
		os: os
			? `${str(os.name) ?? ""} ${str(os.version) ?? ""}`.trim()
			: undefined,
		viewport: viewport?.width
			? `${viewport.width} × ${viewport.height}`
			: undefined,
	};
};

/** The message without its first line when that line already is the issue title. */
export const messageBody = (message: string, title: string) => {
	const [first = "", ...rest] = message.trim().split("\n");
	const sameAsTitle =
		first.trim() === title.trim() ||
		(title.endsWith("…") && first.startsWith(title.slice(0, -1)));
	return (sameAsTitle ? rest.join("\n") : message).trim();
};

const plural = (count: number, one: string, many: string) =>
	`${count} ${count === 1 ? one : many}`;

/** "1 error · 2 failed", or null when the report is clean. */
export const errorSignal = (errors: number, failed: number) =>
	[
		errors ? plural(errors, "error", "errors") : null,
		failed ? `${failed} failed` : null,
	]
		.filter(Boolean)
		.join(" · ") || null;

export const countErrors = (report: ReportDto) => ({
	errors: report.console.filter((c) => c.level === "error").length,
	failed: report.network.filter((n) => n.status === 0 || n.status >= 400)
		.length,
});

/** The annotated screenshot, large, opening the full-size file in a new tab. */
export function Screenshot({ report }: { report: ReportDto }) {
	const { objectUrl, failed } = useFetchedImage(report.screenshotUrl);
	if (!report.screenshotUrl) return null;
	return (
		<a
			href={objectUrl ?? report.screenshotUrl}
			target="_blank"
			rel="noreferrer"
			className="block overflow-hidden rounded-lg border bg-raised"
		>
			{objectUrl ? (
				<img
					src={objectUrl}
					alt="Annotated screenshot sent with the report"
					className="w-full"
				/>
			) : (
				<div className="flex aspect-[16/10] w-full items-center justify-center text-muted-foreground">
					{failed && (
						<span className="flex items-center gap-2">
							<ImageOffIcon className="size-4" />
							Couldn't load the screenshot.
						</span>
					)}
				</div>
			)}
		</a>
	);
}

type Tab = "console" | "network" | "device" | "context";

const levelClass: Record<string, string> = {
	error: "text-negative",
	warn: "text-pill-warning-ink",
	info: "text-ink",
	log: "text-ink",
	debug: "text-muted-foreground",
};

// Log rows are append-only and never reordered, so their position is a stable id.
const withRowIds = <T,>(entries: T[]) =>
	entries.map((entry, index) => ({ entry, rowId: `row-${index}` }));

/** Console, network, device and account data, behind underline tabs. */
export function ReportLogs({ report }: { report: ReportDto }) {
	const { errors, failed } = countErrors(report);
	const [tab, setTab] = useState<Tab>(
		errors > 0 ? "console" : failed > 0 ? "network" : "console",
	);
	const tabs: Array<{
		id: Tab;
		label: string;
		count?: number;
		alert?: number;
	}> = [
		{
			id: "console",
			label: "Console",
			count: report.console.length,
			alert: errors,
		},
		{
			id: "network",
			label: "Network",
			count: report.network.length,
			alert: failed,
		},
		{ id: "device", label: "Device" },
		{ id: "context", label: "Account" },
	];
	return (
		<section aria-label="Logs and context">
			<div role="tablist" className="flex gap-5 overflow-x-auto border-b">
				{tabs.map((t) => (
					<button
						key={t.id}
						type="button"
						role="tab"
						aria-selected={tab === t.id}
						onClick={() => setTab(t.id)}
						className={cn(
							"-mb-px flex h-9 flex-none items-center gap-1.5 border-b-2 border-transparent text-muted-foreground hover:text-ink",
							tab === t.id && "border-brand font-medium text-ink",
						)}
					>
						{t.label}
						{t.count !== undefined && (
							<span className="num text-xs text-muted-foreground">
								{t.count}
							</span>
						)}
						{t.alert ? (
							<span className="num rounded-full bg-pill-negative px-1.5 text-xs font-medium text-pill-negative-ink">
								{t.id === "console"
									? plural(t.alert, "error", "errors")
									: `${t.alert} failed`}
							</span>
						) : null}
					</button>
				))}
			</div>
			<div className="max-h-80 overflow-auto pt-2 font-mono text-xs leading-5">
				{tab === "console" &&
					(report.console.length === 0 ? (
						<p className="py-3 font-sans text-muted-foreground">
							Nothing was logged before the report.
						</p>
					) : (
						<ul>
							{withRowIds(report.console).map(({ entry, rowId }) => (
								<li
									key={rowId}
									className={cn(
										"grid grid-cols-[64px_40px_minmax(0,1fr)] gap-2 border-b border-rule py-1",
										levelClass[entry.level],
									)}
								>
									<span className="num text-muted-foreground">
										{new Date(entry.timestamp).toLocaleTimeString("en-GB")}
									</span>
									<span className="text-muted-foreground">{entry.level}</span>
									<span className="min-w-0 break-words whitespace-pre-wrap">
										{entry.message}
										{entry.stack && (
											<span className="block text-muted-foreground">
												{entry.stack}
											</span>
										)}
									</span>
								</li>
							))}
						</ul>
					))}
				{tab === "network" &&
					(report.network.length === 0 ? (
						<p className="py-3 font-sans text-muted-foreground">
							No requests were recorded.
						</p>
					) : (
						<table className="w-full">
							<tbody>
								{withRowIds(report.network).map(({ entry, rowId }) => {
									const bad = entry.status === 0 || entry.status >= 400;
									return (
										<tr key={rowId} className="border-b border-rule">
											<td
												className={cn(
													"num w-12 py-1 pr-2",
													bad ? "text-negative" : "text-muted-foreground",
												)}
											>
												{entry.status || "ERR"}
											</td>
											<td className="w-14 py-1 pr-2 text-muted-foreground">
												{entry.method}
											</td>
											<td className="max-w-0 truncate py-1" title={entry.url}>
												{entry.url}
											</td>
											<td className="num w-16 py-1 text-right text-muted-foreground">
												{Math.round(entry.durationMs)} ms
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					))}
				{tab === "device" && (
					<pre className="py-2 break-words whitespace-pre-wrap">
						{JSON.stringify(report.device, null, 2)}
					</pre>
				)}
				{tab === "context" && (
					<pre className="py-2 break-words whitespace-pre-wrap">
						{JSON.stringify(
							{ reporter: report.reporter, context: report.context },
							null,
							2,
						)}
					</pre>
				)}
			</div>
		</section>
	);
}

/** Key-value rows describing who sent a report and from where. */
export function ReportFacts({ report }: { report: ReportDto }) {
	const device = deviceSummary(report.device);
	const { errors, failed } = countErrors(report);
	const reporter = report.reporter;
	const traits = Object.entries(reporter?.traits ?? {}).slice(0, 4);
	const rows: Array<[string, React.ReactNode]> = [
		[
			"Reporter",
			reporter?.name || reporter?.email ? (
				<span key="r" className="flex min-w-0 items-center gap-2">
					<Face
						name={reporter.name || reporter.email || "?"}
						id={reporter.id ?? reporter.email}
						size={18}
					/>
					<span className="truncate">{reporter.name || reporter.email}</span>
				</span>
			) : (
				<span key="r" className="text-muted-foreground">
					Anonymous
				</span>
			),
		],
		...(reporter?.email && reporter.name
			? ([
					[
						"Email",
						<span key="e" className="truncate">
							{reporter.email}
						</span>,
					],
				] as Array<[string, React.ReactNode]>)
			: []),
		...(reporter?.id
			? ([
					[
						"User id",
						<span key="i" className="truncate font-mono text-xs">
							{reporter.id}
						</span>,
					],
				] as Array<[string, React.ReactNode]>)
			: []),
		...traits.map(
			([key, value]) =>
				[
					key,
					<span key={key} className="truncate">
						{String(value)}
					</span>,
				] as [string, React.ReactNode],
		),
		[
			"Page",
			<a
				key="p"
				href={report.pageUrl}
				target="_blank"
				rel="noreferrer"
				className="flex min-w-0 items-center gap-1 hover:underline"
			>
				<span className="truncate">
					{report.pageTitle || report.pageUrl.replace(/^https?:\/\//, "")}
				</span>
				<ExternalLinkIcon className="size-3 flex-none text-muted-foreground" />
			</a>,
		],
		["Browser", device.browser ?? "—"],
		["System", device.os ?? "—"],
		[
			"Window",
			device.viewport ? (
				<span key="v" className="num">
					{device.viewport}
				</span>
			) : (
				"—"
			),
		],
		[
			"Errors",
			<span key="x" className={cn("num", errors > 0 && "text-negative")}>
				{plural(errors, "error", "errors")} ·{" "}
				{plural(failed, "failed request", "failed requests")}
			</span>,
		],
		["Sent", relativeTime(report.createdAt)],
	];
	return (
		<dl className="grid grid-cols-[88px_minmax(0,1fr)] content-start gap-x-3 gap-y-2.5 self-start">
			{rows.map(([label, value]) => (
				<div key={label} className="contents">
					<dt className="text-muted-foreground first-letter:uppercase">
						{label}
					</dt>
					<dd className="min-w-0">{value}</dd>
				</div>
			))}
		</dl>
	);
}
