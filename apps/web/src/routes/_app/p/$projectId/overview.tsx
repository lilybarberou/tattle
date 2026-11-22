import { createFileRoute, Link } from "@tanstack/react-router";
import { IssueNumber, StatusIcon } from "#/components/issue-meta";
import { PageHeader } from "#/components/page-header";
import { ReportsChart } from "#/components/reports-chart";
import { RelativeTime } from "#/components/time";
import type { Messages } from "#/i18n";
import { useI18n } from "#/i18n/react";
import { cn } from "#/lib/utils";
import { getOverviewFn } from "#/server/fns";
import type { OverviewIssue } from "#/server/Overview";

export const Route = createFileRoute("/_app/p/$projectId/overview")({
	loader: ({ params }) =>
		getOverviewFn({ data: { projectId: params.projectId } }),
	component: OverviewPage,
});

const OPEN = ["triage", "backlog", "todo", "in_progress", "in_review"] as const;

/** 45 min, 7 h, 3.5 days: precise enough to compare, short enough to scan. */
const formatDuration = (
	m: Messages["overview"]["duration"],
	seconds: number,
) => {
	const minutes = seconds / 60;
	if (minutes < 60) return m.minutes(Math.max(1, Math.round(minutes)));
	const hours = minutes / 60;
	if (hours < 48) return m.hours(Math.round(hours));
	const days = hours / 24;
	return m.days(days < 10 ? Math.round(days * 10) / 10 : Math.round(days));
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
	const { m, number } = useI18n();
	const t = m.overview;
	const d = t.description;

	const description =
		reports.last30 === 0 && reports.previous30 === 0
			? d.nothing
			: `${d.reports(reports.last30)}${
					reports.previous30 === 0
						? d.end
						: change === 0
							? d.same
							: change > 0
								? d.up(reports.previous30)
								: d.down(reports.previous30)
				} ${statuses.triage === 0 ? d.triageClear : d.waiting(statuses.triage)}`;

	return (
		<>
			<PageHeader title={t.title} description={description} />

			<div className="max-w-5xl space-y-4 px-6 pt-5 pb-10">
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Stat
						label={t.reports30}
						value={number(reports.last30)}
						detail={
							reports.previous30 === 0 && reports.last30 === 0
								? t.noneYet
								: t.previous30(reports.previous30)
						}
					/>
					<Link
						to="/p/$projectId/triage"
						params={{ projectId }}
						className="block min-w-0 rounded-lg hover:bg-raised"
					>
						<Stat
							label={t.inTriage}
							value={number(statuses.triage)}
							detail={
								oldestTriageAt ? (
									<>
										{t.oldestArrived} <RelativeTime iso={oldestTriageAt} />
									</>
								) : (
									t.inboxClear
								)
							}
						/>
					</Link>
					<Stat
						label={t.resolved30}
						value={number(resolution.resolved30)}
						detail={t.over90(number(resolution.resolved90))}
					/>
					<Stat
						label={t.medianTime}
						value={
							resolution.median30 === null
								? "–"
								: formatDuration(t.duration, resolution.median30)
						}
						detail={
							resolution.median90 === null
								? t.nothingDone
								: t.over90(formatDuration(t.duration, resolution.median90))
						}
					/>
				</div>

				<Panel title={t.perDay} aside={t.perDayAside(reports.last30)}>
					{reports.last30 === 0 ? (
						<Empty>{t.noReports}</Empty>
					) : (
						<ReportsChart days={days} />
					)}
				</Panel>

				<div className="grid gap-4 lg:grid-cols-2">
					<Panel title={t.openIssues} aside={t.issues(open)}>
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
										<span>{m.common.status[status]}</span>
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

					<Panel title={t.mostReported} aside={t.openIssues}>
						{overview.topReported.length === 0 ? (
							<Empty>{t.noReported}</Empty>
						) : (
							<IssueList
								issues={overview.topReported}
								projectId={projectId}
								measure={(issue) => t.reports(issue.reportCount)}
							/>
						)}
					</Panel>

					{overview.topVoted.length > 0 && (
						<Panel
							title={t.mostVoted}
							aside={t.fromPublicPage}
							className="lg:col-span-2"
						>
							<IssueList
								issues={overview.topVoted}
								projectId={projectId}
								measure={(issue) => t.votes(issue.voteCount)}
							/>
						</Panel>
					)}
				</div>
			</div>
		</>
	);
}
