import { createFileRoute, Link } from "@tanstack/react-router";
import {
	IssueNumber,
	relativeTime,
	STATUS_META,
	StatusIcon,
} from "#/components/issue-meta";
import { PageHeader } from "#/components/page-header";
import { ReportsChart } from "#/components/reports-chart";
import { cn } from "#/lib/utils";
import { getOverviewFn } from "#/server/fns";
import type { OverviewIssue } from "#/server/Overview";

export const Route = createFileRoute("/_app/p/$projectId/overview")({
	loader: ({ params }) =>
		getOverviewFn({ data: { projectId: params.projectId } }),
	component: OverviewPage,
});

const OPEN = ["triage", "backlog", "todo", "in_progress", "in_review"] as const;

const plural = (count: number, one: string, many = `${one}s`) =>
	`${count.toLocaleString("en")} ${count === 1 ? one : many}`;

/** 45 min, 7 h, 3.5 days: precise enough to compare, short enough to scan. */
const formatDuration = (seconds: number) => {
	const minutes = seconds / 60;
	if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
	const hours = minutes / 60;
	if (hours < 48) return `${Math.round(hours)} h`;
	const days = hours / 24;
	return `${days < 10 ? days.toFixed(1).replace(/\.0$/, "") : Math.round(days)} days`;
};

function Stat({
	label,
	value,
	detail,
}: {
	label: string;
	value: React.ReactNode;
	detail?: React.ReactNode;
}) {
	return (
		<div className="min-w-0 rounded-lg border px-4 py-3">
			<p className="text-muted-foreground">{label}</p>
			<p className="mt-1 text-2xl leading-8 font-semibold tracking-[-0.01em]">
				{value}
			</p>
			{detail && (
				<p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
			)}
		</div>
	);
}

function Panel({
	title,
	aside,
	children,
	className,
}: {
	title: string;
	aside?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("min-w-0 rounded-lg border p-4", className)}>
			<div className="mb-3 flex items-baseline justify-between gap-3">
				<h2 className="font-semibold">{title}</h2>
				{aside && (
					<span className="text-xs text-muted-foreground">{aside}</span>
				)}
			</div>
			{children}
		</section>
	);
}

function Empty({ children }: { children: React.ReactNode }) {
	return (
		<p className="rounded-md border border-dashed px-4 py-3 text-muted-foreground">
			{children}
		</p>
	);
}

function IssueList({
	issues,
	projectId,
	measure,
}: {
	issues: OverviewIssue[];
	projectId: string;
	measure: (issue: OverviewIssue) => string;
}) {
	return (
		<ol className="-mx-2">
			{issues.map((issue) => (
				<li key={issue.number}>
					<Link
						to="/p/$projectId/issues/$number"
						params={{ projectId, number: String(issue.number) }}
						className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-2 hover:bg-raised"
					>
						<StatusIcon status={issue.status} />
						<span className="flex min-w-0 items-center gap-2">
							<span className="truncate font-medium">{issue.title}</span>
							<IssueNumber number={issue.number} className="flex-none" />
						</span>
						<span className="num text-muted-foreground">{measure(issue)}</span>
					</Link>
				</li>
			))}
		</ol>
	);
}

function OverviewPage() {
	const overview = Route.useLoaderData();
	const { projectId } = Route.useParams();
	const { days, reports, statuses, resolution, oldestTriageAt } = overview;
	const open = OPEN.reduce((sum, status) => sum + statuses[status], 0);
	const topStatus = Math.max(1, ...OPEN.map((status) => statuses[status]));
	const change = reports.last30 - reports.previous30;

	const description =
		reports.last30 === 0 && reports.previous30 === 0
			? "Nothing reported in the last 30 days."
			: `${plural(reports.last30, "report")} in the last 30 days${
					reports.previous30 === 0
						? "."
						: change === 0
							? ", as many as the 30 days before."
							: `, ${change > 0 ? "up" : "down"} from ${reports.previous30.toLocaleString("en")}.`
				} ${
					statuses.triage === 0
						? "Triage is clear."
						: `${plural(statuses.triage, "issue")} waiting in Triage.`
				}`;

	return (
		<>
			<PageHeader title="Overview" description={description} />

			<div className="max-w-5xl space-y-4 px-6 pt-5 pb-10">
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Stat
						label="Reports, 30 days"
						value={reports.last30.toLocaleString("en")}
						detail={
							reports.previous30 === 0 && reports.last30 === 0
								? "None yet"
								: `${reports.previous30.toLocaleString("en")} the 30 days before`
						}
					/>
					<Link
						to="/p/$projectId/triage"
						params={{ projectId }}
						className="block min-w-0 rounded-lg hover:bg-raised"
					>
						<Stat
							label="In triage"
							value={statuses.triage.toLocaleString("en")}
							detail={
								oldestTriageAt
									? `Oldest arrived ${relativeTime(oldestTriageAt)}`
									: "Inbox clear"
							}
						/>
					</Link>
					<Stat
						label="Resolved, 30 days"
						value={resolution.resolved30.toLocaleString("en")}
						detail={`${resolution.resolved90.toLocaleString("en")} over 90 days`}
					/>
					<Stat
						label="Median time to resolve"
						value={
							resolution.median30 === null
								? "–"
								: formatDuration(resolution.median30)
						}
						detail={
							resolution.median90 === null
								? "Nothing moved to Done yet"
								: `${formatDuration(resolution.median90)} over 90 days`
						}
					/>
				</div>

				<Panel
					title="Reports per day"
					aside={`Last 30 days, UTC · ${plural(reports.last30, "report")}`}
				>
					{reports.last30 === 0 ? (
						<Empty>
							No reports in the last 30 days. When people send a bug or an idea
							from the widget, each day shows up here.
						</Empty>
					) : (
						<ReportsChart days={days} />
					)}
				</Panel>

				<div className="grid gap-4 lg:grid-cols-2">
					<Panel title="Open issues" aside={plural(open, "issue")}>
						<ul className="-mx-2">
							{OPEN.map((status) => (
								<li key={status}>
									<Link
										to={
											status === "triage"
												? "/p/$projectId/triage"
												: "/p/$projectId/issues"
										}
										params={{ projectId }}
										search={
											status === "in_progress" || status === "in_review"
												? { view: "progress" }
												: {}
										}
										className="grid grid-cols-[14px_96px_minmax(0,1fr)_40px] items-center gap-2.5 rounded-md px-2 py-2 hover:bg-raised"
									>
										<StatusIcon status={status} />
										<span>{STATUS_META[status].label}</span>
										<span className="h-[3px] rounded-full bg-rule">
											<span
												className="block h-full rounded-full bg-control"
												style={{
													width: `${(statuses[status] / topStatus) * 100}%`,
												}}
											/>
										</span>
										<span className="num text-right font-medium">
											{statuses[status]}
										</span>
									</Link>
								</li>
							))}
						</ul>
					</Panel>

					<Panel title="Most reported" aside="Open issues">
						{overview.topReported.length === 0 ? (
							<Empty>
								No open issue has reports yet. Issues that many people run into
								rise to the top here.
							</Empty>
						) : (
							<IssueList
								issues={overview.topReported}
								projectId={projectId}
								measure={(issue) => plural(issue.reportCount, "report")}
							/>
						)}
					</Panel>

					{overview.topVoted.length > 0 && (
						<Panel
							title="Most voted requests"
							aside="From the public page"
							className="lg:col-span-2"
						>
							<IssueList
								issues={overview.topVoted}
								projectId={projectId}
								measure={(issue) => plural(issue.voteCount, "vote")}
							/>
						</Panel>
					)}
				</div>
			</div>
		</>
	);
}
