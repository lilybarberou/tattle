import { ExternalLinkIcon, ImageOffIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { DEFAULT_LOCALE, type Locale, messages } from "#/i18n";
import { useI18n } from "#/i18n/react";
import { cn } from "#/lib/utils";
import type { ReportDto, SeenInRelease } from "#/server/Issues";
import { deviceSummary, isWebPage } from "#/shared/device";
import { buildTrail, isFailedRequest } from "#/shared/trail";
import { Face } from "./issue-meta";
import { ClockTime, RelativeTime, relativeTime, useHydrated } from "./time";

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

/** The message without its first line when that line already is the issue title. */
export const messageBody = (message: string, title: string) => {
	const [first = "", ...rest] = message.trim().split("\n");
	const sameAsTitle =
		first.trim() === title.trim() ||
		(title.endsWith("…") && first.startsWith(title.slice(0, -1)));
	return (sameAsTitle ? rest.join("\n") : message).trim();
};

/** "1 error · 2 failed", or null when the report is clean. */
export const errorSignal = (
	errors: number,
	failed: number,
	locale: Locale = DEFAULT_LOCALE,
) => {
	const m = messages(locale).issues.evidence;
	return (
		[errors ? m.errors(errors) : null, failed ? m.failed(failed) : null]
			.filter(Boolean)
			.join(" · ") || null
	);
};

export const countErrors = (report: ReportDto) => ({
	errors: report.console.filter((c) => c.level === "error").length,
	failed: report.network.filter(isFailedRequest).length,
});

/**
 * The annotated screenshot, large, opening the full-size file in a new tab.
 * Its height is capped so a phone screenshot doesn't push the logs off screen;
 * a desktop one still fills the column.
 */
export function Screenshot({ report }: { report: ReportDto }) {
	const { m } = useI18n();
	const { objectUrl, failed } = useFetchedImage(report.screenshotUrl);
	if (!report.screenshotUrl) return null;
	return (
		<a
			href={objectUrl ?? report.screenshotUrl}
			target="_blank"
			rel="noreferrer"
			className={cn(
				"block overflow-hidden rounded-lg border bg-raised",
				objectUrl && "w-fit max-w-full",
			)}
		>
			{objectUrl ? (
				<img
					src={objectUrl}
					alt={m.issues.evidence.screenshotAlt}
					className="max-h-[32rem] w-auto max-w-full"
				/>
			) : (
				<div className="flex aspect-[16/10] w-full items-center justify-center text-muted-foreground">
					{failed && (
						<span className="flex items-center gap-2">
							<ImageOffIcon className="size-4" />
							{m.issues.evidence.screenshotFailed}
						</span>
					)}
				</div>
			)}
		</a>
	);
}

type Tab = "steps" | "console" | "network" | "device" | "context";

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

const isStepCategory = (
	category: string,
): category is "navigation" | "click" | "input" | "app" =>
	["navigation", "click", "input", "app"].includes(category);

/**
 * What the user did before sending, oldest first, with the console errors and
 * failed requests in between: usually enough to reproduce the bug.
 */
function StepsTimeline({ report }: { report: ReportDto }) {
	const { m } = useI18n();
	const e = m.issues.evidence;
	const trail = buildTrail(report);
	if (report.breadcrumbs.length === 0)
		return <p className="py-3 font-sans text-muted-foreground">{e.noSteps}</p>;
	return (
		<ol aria-label={e.stepsLabel}>
			{withRowIds(trail).map(({ entry, rowId }) => (
				<li
					key={rowId}
					className={cn(
						"grid grid-cols-[64px_64px_minmax(0,1fr)] gap-2 border-b border-rule py-1",
						entry.kind !== "step" && "text-negative",
					)}
				>
					<span className="num text-muted-foreground">
						<ClockTime timestamp={entry.timestamp} />
					</span>
					<span className="truncate text-muted-foreground">
						{entry.kind === "step"
							? isStepCategory(entry.category)
								? e.step[entry.category]
								: entry.category
							: entry.kind === "error"
								? e.stepError
								: e.stepFailed}
					</span>
					<span className="min-w-0 break-words whitespace-pre-wrap">
						{entry.kind === "step" ? (
							<>
								{entry.message}
								{entry.data && (
									<span className="text-muted-foreground">
										{" "}
										{Object.entries(entry.data)
											.map(([key, value]) => `${key}: ${String(value)}`)
											.join(" · ")}
									</span>
								)}
							</>
						) : entry.kind === "error" ? (
							<span className="line-clamp-3">{entry.message}</span>
						) : (
							<>
								{entry.method} {entry.url}{" "}
								<span className="num">
									{entry.status || entry.error || e.noResponse}
								</span>
							</>
						)}
					</span>
				</li>
			))}
			<li className="grid grid-cols-[64px_64px_minmax(0,1fr)] gap-2 py-1 text-muted-foreground">
				<span />
				<span>{e.stepSent}</span>
				<span className="font-sans">{e.reportSent}</span>
			</li>
		</ol>
	);
}

/** Steps, console, network, device and account data, behind underline tabs. */
export function ReportLogs({ report }: { report: ReportDto }) {
	const { m, number } = useI18n();
	const e = m.issues.evidence;
	const { errors, failed } = countErrors(report);
	const [tab, setTab] = useState<Tab>(
		report.breadcrumbs.length > 0
			? "steps"
			: errors > 0
				? "console"
				: failed > 0
					? "network"
					: "console",
	);
	const tabs: Array<{
		id: Tab;
		label: string;
		count?: number;
		alert?: number;
	}> = [
		{ id: "steps", label: e.tabs.steps, count: report.breadcrumbs.length },
		{
			id: "console",
			label: e.tabs.console,
			count: report.console.length,
			alert: errors,
		},
		{
			id: "network",
			label: e.tabs.network,
			count: report.network.length,
			alert: failed,
		},
		{ id: "device", label: e.tabs.device },
		{ id: "context", label: e.tabs.context },
	];
	const ids = useId();
	const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
	// Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern): only
	// the selected tab is in the Tab order, the next Tab stop is its panel.
	const onTabKeyDown = (event: React.KeyboardEvent) => {
		const index = tabs.findIndex((t) => t.id === tab);
		const next =
			event.key === "ArrowRight"
				? (index + 1) % tabs.length
				: event.key === "ArrowLeft"
					? (index - 1 + tabs.length) % tabs.length
					: event.key === "Home"
						? 0
						: event.key === "End"
							? tabs.length - 1
							: null;
		if (next === null) return;
		event.preventDefault();
		const id = tabs[next].id;
		setTab(id);
		tabRefs.current.get(id)?.focus();
	};
	return (
		<section aria-label={e.logsLabel}>
			<div
				role="tablist"
				aria-label={e.logsLabel}
				className="flex gap-5 overflow-x-auto border-b"
			>
				{tabs.map((t) => (
					<button
						key={t.id}
						ref={(node) => {
							if (node) tabRefs.current.set(t.id, node);
							else tabRefs.current.delete(t.id);
						}}
						id={`${ids}-tab-${t.id}`}
						type="button"
						role="tab"
						aria-selected={tab === t.id}
						aria-controls={`${ids}-panel`}
						tabIndex={tab === t.id ? 0 : -1}
						onKeyDown={onTabKeyDown}
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
								{t.id === "console" ? e.errors(t.alert) : e.failed(t.alert)}
							</span>
						) : null}
					</button>
				))}
			</div>
			{/* Focusable, so the logs scroll with the keyboard too. */}
			<div
				id={`${ids}-panel`}
				role="tabpanel"
				aria-labelledby={`${ids}-tab-${tab}`}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: a tab panel that scrolls must be reachable from the keyboard
				tabIndex={0}
				className="max-h-80 overflow-auto pt-2 font-mono text-xs leading-5 focus-visible:outline-2 focus-visible:outline-offset-2"
			>
				{tab === "steps" && <StepsTimeline report={report} />}
				{tab === "console" &&
					(report.console.length === 0 ? (
						<p className="py-3 font-sans text-muted-foreground">
							{e.noConsole}
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
										<ClockTime timestamp={entry.timestamp} />
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
							{e.noNetwork}
						</p>
					) : (
						<table className="w-full">
							<tbody>
								{withRowIds(report.network).map(({ entry, rowId }) => {
									const bad = isFailedRequest(entry);
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
												{e.ms(number(Math.round(entry.durationMs)))}
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

/**
 * The release an issue was first reported from, and the last one when it
 * differs: "1.4.0 → 1.5.2". Hovering lists every release with its reports.
 */
export function SeenIn({ releases }: { releases: SeenInRelease[] }) {
	const { m, locale } = useI18n();
	const e = m.issues.evidence;
	// "last 2 days ago" depends on the reader's clock: only once hydrated.
	const hydrated = useHydrated();
	const first = releases[0];
	if (!first) return <span className="text-muted-foreground">—</span>;
	const last = releases.reduce((a, b) => (b.lastSeen > a.lastSeen ? b : a));
	const details = releases
		.map(
			(r) =>
				`${e.seenInDetail(r.release, e.reports(r.reports))}${hydrated ? e.lastSeen(relativeTime(r.lastSeen, Date.now(), locale)) : ""}`,
		)
		.join("\n");
	return (
		<span title={details} className="flex min-w-0 items-center gap-1.5">
			<span className="truncate">{first.release}</span>
			{last.release !== first.release && (
				<>
					<span aria-hidden className="text-muted-foreground">
						→
					</span>
					<span className="sr-only">{e.lastSeenIn}</span>
					<span className="truncate">{last.release}</span>
				</>
			)}
		</span>
	);
}

/** Key-value rows describing who sent a report and from where. */
export function ReportFacts({
	report,
	seenIn,
}: {
	report: ReportDto;
	/** The issue's releases: shown when the issue spans more than this one. */
	seenIn?: SeenInRelease[];
}) {
	const { m } = useI18n();
	const e = m.issues.evidence;
	const f = e.facts;
	const device = deviceSummary(report.device);
	const { errors, failed } = countErrors(report);
	const reporter = report.reporter;
	const traits = Object.entries(reporter?.traits ?? {}).slice(0, 4);
	const rows: Array<[string, React.ReactNode]> = [
		[
			f.reporter,
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
					{f.anonymous}
				</span>
			),
		],
		...(reporter?.email && reporter.name
			? ([
					[
						f.email,
						<span key="e" className="truncate">
							{reporter.email}
						</span>,
					],
				] as Array<[string, React.ReactNode]>)
			: []),
		...(reporter?.id
			? ([
					[
						f.userId,
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
		isWebPage(report.pageUrl)
			? [
					f.page,
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
				]
			: [
					f.screen,
					<span key="p" className="truncate">
						{report.pageTitle || report.pageUrl || "—"}
					</span>,
				],
		...((device.mobile
			? [
					[f.app, device.app ?? "—"],
					[f.device, device.model ?? "—"],
					[f.system, device.os ?? "—"],
				]
			: [
					[f.browser, device.browser ?? "—"],
					[f.system, device.os ?? "—"],
				]) as Array<[string, React.ReactNode]>),
		// Mobile apps already show their version in the App row.
		...(report.release && !device.app?.includes(report.release)
			? ([
					[
						f.release,
						<span key="rel" className="truncate">
							{report.release}
						</span>,
					],
				] as Array<[string, React.ReactNode]>)
			: []),
		...(seenIn && seenIn.length > 1
			? ([[f.seenIn, <SeenIn key="seen" releases={seenIn} />]] as Array<
					[string, React.ReactNode]
				>)
			: []),
		[
			device.mobile ? f.screenSize : f.window,
			device.viewport ? (
				<span key="v" className="num">
					{device.viewport}
				</span>
			) : (
				"—"
			),
		],
		[
			f.errors,
			<span key="x" className={cn("num", errors > 0 && "text-negative")}>
				{e.errors(errors)} · {e.failedRequests(failed)}
			</span>,
		],
		[f.sent, <RelativeTime key="s" iso={report.createdAt} />],
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
