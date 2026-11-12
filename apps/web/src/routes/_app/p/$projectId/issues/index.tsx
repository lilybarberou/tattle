import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import * as z from "zod";
import { useAppActions } from "#/components/app-actions";
import {
	AwaitingReply,
	Face,
	IssueNumber,
	LabelChip,
	PriorityIcon,
	STATUS_META,
	StatusIcon,
	TypeIcon,
} from "#/components/issue-meta";
import { PageHeader } from "#/components/page-header";
import { ReleasePicker } from "#/components/pickers";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { listIssuesFn, listReleasesFn } from "#/server/fns";
import type { IssueListItem } from "#/server/Issues";
import type { IssueStatus } from "#/shared/issues";

const VIEWS = {
	open: {
		label: "Open",
		statuses: ["in_progress", "in_review", "todo", "backlog"],
	},
	progress: { label: "In progress", statuses: ["in_progress", "in_review"] },
	done: { label: "Done", statuses: ["done"] },
	closed: { label: "Declined & merged", statuses: ["canceled", "duplicate"] },
} satisfies Record<string, { label: string; statuses: IssueStatus[] }>;
type View = keyof typeof VIEWS;

const searchSchema = z.object({
	view: z.enum(["open", "progress", "done", "closed"]).optional(),
	type: z.enum(["bug", "feature"]).optional(),
	q: z.string().optional(),
	release: z.string().optional(),
});

export const Route = createFileRoute("/_app/p/$projectId/issues/")({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }) => {
		const [issues, releases] = await Promise.all([
			listIssuesFn({
				data: {
					projectId: params.projectId,
					statuses: VIEWS[deps.view ?? "open"].statuses,
					type: deps.type,
					query: deps.q || undefined,
					release: deps.release || undefined,
				},
			}),
			listReleasesFn({ data: { projectId: params.projectId } }),
		]);
		return { issues, releases };
	},
	component: IssuesPage,
});

const dateFormat = new Intl.DateTimeFormat("en", {
	month: "short",
	day: "numeric",
});

function IssueRow({
	issue,
	projectId,
}: {
	issue: IssueListItem;
	projectId: string;
}) {
	return (
		<li>
			<Link
				to="/p/$projectId/issues/$number"
				params={{ projectId, number: String(issue.number) }}
				className="grid h-11 grid-cols-[14px_44px_14px_minmax(0,1fr)_auto] items-center gap-3 px-6 hover:bg-raised max-sm:h-auto max-sm:grid-cols-[14px_minmax(0,1fr)_auto] max-sm:py-2.5"
			>
				<PriorityIcon priority={issue.priority} />
				<IssueNumber number={issue.number} className="max-sm:hidden" />
				<StatusIcon status={issue.status} className="max-sm:hidden" />
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate font-medium">{issue.title}</span>
					<span className="hidden flex-none items-center gap-1 lg:flex">
						{issue.labels.slice(0, 3).map((label) => (
							<LabelChip key={label}>{label}</LabelChip>
						))}
					</span>
				</span>
				<span className="flex items-center justify-end gap-4 text-muted-foreground">
					{issue.awaitingReply && <AwaitingReply />}
					{issue.reportCount > 1 && (
						<span
							className="num flex items-center gap-1 text-xs"
							title={`${issue.reportCount} people reported this`}
						>
							<UsersIcon className="size-3.5" />
							{issue.reportCount}
						</span>
					)}
					<TypeIcon type={issue.type} className="max-sm:hidden" />
					<span className="flex w-5 justify-center">
						{issue.assignee ? (
							<Face
								name={issue.assignee.name ?? "?"}
								id={issue.assignee.id}
								kind={issue.assignee.type}
								size={20}
							/>
						) : (
							<span
								className="size-5 rounded-full border border-dashed border-control"
								title="Unassigned"
							/>
						)}
					</span>
					<span className="num w-12 text-right text-xs max-sm:hidden">
						{dateFormat.format(new Date(issue.updatedAt))}
					</span>
				</span>
			</Link>
		</li>
	);
}

function IssuesPage() {
	const { issues, releases } = Route.useLoaderData();
	const { projectId } = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const { newIssue } = useAppActions();
	const view: View = search.view ?? "open";
	const [query, setQuery] = useState(search.q ?? "");

	useEffect(() => {
		const timer = setTimeout(() => {
			if ((search.q ?? "") !== query)
				void navigate({
					search: (prev) => ({ ...prev, q: query || undefined }),
					replace: true,
				});
		}, 250);
		return () => clearTimeout(timer);
	}, [query, search.q, navigate]);

	const groups = VIEWS[view].statuses
		.map((status) => ({
			status,
			items: issues.filter((i) => i.status === status),
		}))
		.filter((g) => g.items.length > 0);

	return (
		<>
			<PageHeader
				title="Issues"
				actions={
					<Button onClick={() => newIssue()}>
						<PlusIcon className="size-4" />
						New issue
						<kbd className="border-white/20 bg-white/10 text-current dark:border-black/20 dark:bg-black/10">
							C
						</kbd>
					</Button>
				}
			>
				<nav
					aria-label="Views"
					className="mt-4 flex gap-5 overflow-x-auto border-b"
				>
					{(Object.keys(VIEWS) as View[]).map((key) => (
						<Link
							key={key}
							to="/p/$projectId/issues"
							params={{ projectId }}
							search={{ ...search, view: key === "open" ? undefined : key }}
							className={cn(
								"-mb-px flex h-9 flex-none items-center border-b-2 border-transparent text-muted-foreground hover:text-ink",
								view === key && "border-brand font-medium text-ink",
							)}
						>
							{VIEWS[key].label}
						</Link>
					))}
				</nav>
			</PageHeader>

			<div className="flex flex-wrap items-center gap-3 px-6 py-3">
				<label className="relative w-full max-w-[300px]">
					<span className="sr-only">Search titles</span>
					<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<input
						id="issue-search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search titles"
						className="h-8 w-full rounded-md border border-control bg-surface pr-3 pl-8 outline-none focus-visible:border-brand"
					/>
				</label>
				<div className="flex rounded-md border border-control p-0.5">
					{(
						[
							[undefined, "All"],
							["bug", "Bugs"],
							["feature", "Requests"],
						] as const
					).map(([type, label]) => (
						<Link
							key={label}
							to="/p/$projectId/issues"
							params={{ projectId }}
							search={{ ...search, type }}
							className={cn(
								"rounded px-2.5 py-1 text-muted-foreground hover:text-ink",
								search.type === type && "bg-active font-medium text-ink",
							)}
						>
							{label}
						</Link>
					))}
				</div>
				{(releases.length > 0 || search.release) && (
					<ReleasePicker
						releases={releases}
						value={search.release}
						onChange={(release) =>
							navigate({ search: (prev) => ({ ...prev, release }) })
						}
						className="max-w-[220px]"
					/>
				)}
				<p className="num ml-auto text-muted-foreground">
					{issues.length} {issues.length === 1 ? "issue" : "issues"}
				</p>
			</div>

			{groups.length === 0 ? (
				<div className="mx-6 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-5 py-4">
					<p className="text-muted-foreground">
						{search.q
							? `No issue in “${VIEWS[view].label}” matches “${search.q}”.`
							: search.release
								? `No issue in “${VIEWS[view].label}” was reported from ${search.release}.`
								: view === "open"
									? "No open issue. Accepted reports and issues you write show up here."
									: `Nothing in “${VIEWS[view].label}” yet.`}
					</p>
					{view === "open" && !search.q && !search.release && (
						<Button variant="outline" onClick={() => newIssue()}>
							<PlusIcon className="size-4" />
							New issue
						</Button>
					)}
				</div>
			) : (
				<div className="pb-6">
					{groups.map((group) => (
						<section
							key={group.status}
							aria-label={STATUS_META[group.status].label}
						>
							<h2 className="sticky top-0 z-[1] flex h-9 items-center gap-2 bg-raised px-6 text-[13px] font-medium">
								<StatusIcon status={group.status} />
								{STATUS_META[group.status].label}
								<span className="num font-normal text-muted-foreground">
									{group.items.length}
								</span>
							</h2>
							<ul className="divide-y divide-rule">
								{group.items.map((issue) => (
									<IssueRow
										key={issue.id}
										issue={issue}
										projectId={projectId}
									/>
								))}
							</ul>
						</section>
					))}
				</div>
			)}
		</>
	);
}
