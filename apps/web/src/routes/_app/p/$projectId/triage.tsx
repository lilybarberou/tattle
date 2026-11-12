import {
	createFileRoute,
	getRouteApi,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	CheckIcon,
	ImageIcon,
	InboxIcon,
	MaximizeIcon,
	MergeIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as z from "zod";
import {
	Face,
	IssueNumber,
	StatusIcon,
	shortTime,
	TypeIcon,
} from "#/components/issue-meta";
import { Markdown } from "#/components/markdown";
import { MergeDialog } from "#/components/merge-dialog";
import { AssigneePicker, PriorityPicker } from "#/components/pickers";
import {
	messageBody,
	ReportFacts,
	ReportLogs,
	Screenshot,
} from "#/components/report-evidence";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import {
	getIssueFn,
	listIssuesFn,
	markDuplicateFn,
	updateIssueFn,
} from "#/server/fns";
import type { IssueListItem } from "#/server/Issues";

const appRoute = getRouteApi("/_app");

export const Route = createFileRoute("/_app/p/$projectId/triage")({
	validateSearch: z.object({ selected: z.number().int().optional() }),
	loaderDeps: ({ search }) => ({ selected: search.selected }),
	loader: async ({ params, deps }) => {
		const [issues, recent] = await Promise.all([
			listIssuesFn({
				data: { projectId: params.projectId, statuses: ["triage"] },
			}),
			listIssuesFn({
				data: {
					projectId: params.projectId,
					statuses: ["backlog", "todo", "in_progress", "canceled", "duplicate"],
					limit: 5,
				},
			}),
		]);
		// Oldest first: triage is a queue.
		issues.reverse();
		const selected =
			issues.find((i) => i.number === deps.selected) ?? issues[0] ?? null;
		const detail = selected
			? await getIssueFn({
					data: { projectId: params.projectId, number: selected.number },
				})
			: null;
		return { issues, detail, recent };
	},
	component: TriagePage,
});

const isTyping = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function reporterName(item: IssueListItem) {
	const r = item.lastReport?.reporter;
	return r?.name || r?.email || "Anonymous";
}

function InboxRow({
	item,
	selected,
	projectId,
	onPick,
}: {
	item: IssueListItem;
	selected: boolean;
	projectId: string;
	onPick: () => void;
}) {
	const report = item.lastReport;
	const signals = [
		report?.consoleErrors
			? `${report.consoleErrors} ${report.consoleErrors === 1 ? "error" : "errors"}`
			: null,
		report?.failedRequests ? `${report.failedRequests} failed` : null,
	].filter(Boolean);
	return (
		<li>
			<Link
				onClick={onPick}
				to="/p/$projectId/triage"
				params={{ projectId }}
				search={{ selected: item.number }}
				replace
				aria-current={selected ? "true" : undefined}
				className={cn(
					"relative grid grid-cols-[20px_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 rounded-md px-3 py-2.5 hover:bg-raised",
					selected && "bg-active hover:bg-active",
				)}
			>
				{selected && (
					<span
						aria-hidden
						className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-brand"
					/>
				)}
				<Face
					name={reporterName(item)}
					id={report?.reporter?.id ?? report?.reporter?.email}
					size={20}
					className="row-span-2 mt-0.5"
				/>
				<span className="truncate font-semibold">{reporterName(item)}</span>
				<span className="num text-xs text-muted-foreground">
					{shortTime(item.createdAt)}
				</span>
				<span className="truncate text-ink/80">{item.title}</span>
				<span className="flex items-center gap-1.5 text-muted-foreground">
					{report?.hasScreenshot && (
						<ImageIcon className="size-3.5" aria-label="Has a screenshot" />
					)}
					<TypeIcon type={item.type} />
				</span>
				{signals.length > 0 && (
					<span className="col-start-2 text-xs text-negative">
						{signals.join(" · ")}
					</span>
				)}
			</Link>
		</li>
	);
}

function TriagePage() {
	const { issues, detail, recent } = Route.useLoaderData();
	const { projectId } = Route.useParams();
	const { projects } = appRoute.useLoaderData();
	const navigate = useNavigate({ from: Route.fullPath });
	const router = useRouter();
	const [merging, setMerging] = useState(false);
	const [busy, setBusy] = useState(false);
	const [mobileDetail, setMobileDetail] = useState(false);
	const listRef = useRef<HTMLUListElement>(null);

	const project = projects.find((p) => p.id === projectId);
	const selected = detail?.issue ?? null;
	const index = selected
		? issues.findIndex((i) => i.number === selected.number)
		: -1;
	const withErrors = issues.filter(
		(i) =>
			(i.lastReport?.consoleErrors ?? 0) + (i.lastReport?.failedRequests ?? 0) >
			0,
	).length;

	const select = useCallback(
		(number: number | undefined) =>
			navigate({ search: { selected: number }, replace: true }),
		[navigate],
	);

	// After a decision, move on to the next report in the queue.
	const decide = useCallback(
		async (label: string, action: () => Promise<unknown>) => {
			if (!selected || busy) return;
			setBusy(true);
			const next = issues[index + 1] ?? issues[index - 1];
			try {
				await action();
				toast.success(label);
				await select(next?.number);
				await router.invalidate();
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Something went wrong",
				);
			} finally {
				setBusy(false);
			}
		},
		[busy, index, issues, router, select, selected],
	);

	const accept = useCallback(
		() =>
			selected &&
			decide(`#${selected.number} accepted into Backlog`, () =>
				updateIssueFn({
					data: { projectId, number: selected.number, status: "backlog" },
				}),
			),
		[decide, projectId, selected],
	);
	const decline = useCallback(
		() =>
			selected &&
			decide(`#${selected.number} declined`, () =>
				updateIssueFn({
					data: { projectId, number: selected.number, status: "canceled" },
				}),
			),
		[decide, projectId, selected],
	);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				isTyping(event.target)
			)
				return;
			if (document.querySelector("[role=dialog]")) return;
			const key = event.key.toLowerCase();
			if (key === "j" || event.key === "ArrowDown") {
				event.preventDefault();
				const next = issues[index + 1];
				if (next) void select(next.number);
			} else if (key === "k" || event.key === "ArrowUp") {
				event.preventDefault();
				const previous = issues[index - 1];
				if (previous) void select(previous.number);
			} else if (key === "a") {
				event.preventDefault();
				void accept();
			} else if (key === "x") {
				event.preventDefault();
				void decline();
			} else if (key === "m") {
				event.preventDefault();
				if (selected) setMerging(true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [accept, decline, index, issues, select, selected]);

	useEffect(() => {
		listRef.current
			?.querySelector("[aria-current=true]")
			?.scrollIntoView({ block: "nearest" });
	}, []);

	const latest = detail?.reports[0] ?? null;
	const body =
		latest && selected ? messageBody(latest.message, selected.title) : "";
	// A widget issue's description is its first report's message, already shown
	// as plain text. One written in the app, by an agent or on the portal is
	// Markdown.
	const description =
		detail &&
		(detail.reports.length === 0 ||
			detail.issue.description.trim() !== detail.reports.at(-1)?.message.trim())
			? detail.issue.description.trim()
			: "";

	return (
		<div className="grid h-full min-h-[calc(100dvh-48px)] md:min-h-0 lg:grid-cols-[minmax(300px,384px)_minmax(0,1fr)]">
			{/* Queue */}
			<section
				aria-label="Reports waiting for a decision"
				className={cn(
					"flex min-h-0 flex-col max-lg:border-r-0 lg:border-r",
					mobileDetail && "max-lg:hidden",
				)}
			>
				<header className="px-5 pt-5 pb-3">
					<h1 className="flex items-baseline gap-2 text-[22px] leading-7 font-semibold tracking-[-0.01em]">
						Triage
						<span className="num text-base font-normal text-muted-foreground">
							{issues.length}
						</span>
					</h1>
					<p className="mt-1 text-muted-foreground">
						{issues.length === 0
							? "Nothing is waiting for a decision."
							: withErrors > 0
								? `${withErrors} of ${issues.length} came with console errors or failed requests.`
								: `${issues.length} new, oldest first.`}
					</p>
				</header>
				{issues.length === 0 ? (
					<div className="mx-5 mt-2 flex flex-col items-start gap-3 rounded-lg border border-dashed p-5">
						<InboxIcon className="size-5 text-muted-foreground" />
						<p>
							New reports from the widget land here. Your agent can sort them
							too, through MCP.
						</p>
						<Link
							to="/p/$projectId/settings"
							params={{ projectId }}
							className="font-medium text-brand hover:underline"
						>
							Install the widget
						</Link>
					</div>
				) : (
					<div className="flex-1 overflow-y-auto pb-3">
						<ul ref={listRef} className="space-y-0.5 px-3 lg:px-2">
							{issues.map((item) => (
								<InboxRow
									key={item.id}
									item={item}
									selected={item.number === selected?.number}
									projectId={projectId}
									onPick={() => setMobileDetail(true)}
								/>
							))}
						</ul>
						{recent.length > 0 && (
							<section aria-labelledby="recent" className="mt-6 px-5">
								<h2
									id="recent"
									className="mb-1 text-xs font-medium text-muted-foreground"
								>
									Recently decided
								</h2>
								<ul>
									{recent.map((item) => (
										<li key={item.id}>
											<Link
												to="/p/$projectId/issues/$number"
												params={{ projectId, number: String(item.number) }}
												className="-mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-muted-foreground hover:bg-raised hover:text-ink"
											>
												<StatusIcon status={item.status} />
												<span className="min-w-0 flex-1 truncate">
													{item.title}
												</span>
												<span className="num text-xs">
													{shortTime(item.updatedAt)}
												</span>
											</Link>
										</li>
									))}
								</ul>
							</section>
						)}
					</div>
				)}
				{issues.length > 0 && (
					<p className="hidden gap-3 border-t px-5 py-2.5 text-xs text-muted-foreground lg:flex">
						<span>
							<kbd>J</kbd> <kbd>K</kbd> move
						</span>
						<span>
							<kbd>A</kbd> accept
						</span>
						<span>
							<kbd>M</kbd> merge
						</span>
						<span>
							<kbd>X</kbd> decline
						</span>
					</p>
				)}
			</section>

			{/* Open report */}
			<section
				aria-label="Selected report"
				className={cn(
					"min-h-0 overflow-y-auto",
					!mobileDetail && "max-lg:hidden",
				)}
			>
				{selected && detail ? (
					<>
						<div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-surface/95 px-6 py-3">
							<Button
								size="icon-sm"
								variant="ghost"
								className="lg:hidden"
								aria-label="Back to the queue"
								onClick={() => setMobileDetail(false)}
							>
								<ArrowLeftIcon className="size-4" />
							</Button>
							<IssueNumber number={selected.number} />
							<span className="text-xs text-muted-foreground">
								{index + 1} of {issues.length}
							</span>
							<div className="ml-auto flex flex-wrap items-center gap-2">
								<Button onClick={accept} disabled={busy}>
									<CheckIcon className="size-4" />
									Accept
									<kbd className="border-white/20 bg-white/10 text-current dark:border-black/20 dark:bg-black/10">
										A
									</kbd>
								</Button>
								<Button
									variant="outline"
									onClick={() => setMerging(true)}
									disabled={busy}
								>
									<MergeIcon className="size-4" />
									Merge
									<kbd>M</kbd>
								</Button>
								<Button variant="ghost" onClick={decline} disabled={busy}>
									<XIcon className="size-4" />
									Decline
									<kbd>X</kbd>
								</Button>
								<Button size="icon-sm" variant="ghost" asChild>
									<Link
										to="/p/$projectId/issues/$number"
										params={{ projectId, number: String(selected.number) }}
										aria-label="Open the full issue"
										title="Open the full issue"
									>
										<MaximizeIcon className="size-4" />
									</Link>
								</Button>
							</div>
						</div>

						<div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_300px]">
							<div className="min-w-0 space-y-5">
								<div>
									<h2 className="text-xl leading-7 font-semibold text-balance">
										{selected.title}
									</h2>
									{description && (
										<Markdown className="mt-2 max-w-[70ch] text-[15px] leading-6">
											{description}
										</Markdown>
									)}
									{body && (
										<p
											className={cn(
												"mt-2 max-w-[70ch] text-[15px] leading-6 whitespace-pre-wrap",
												description &&
													"border-l-2 border-control pl-3 text-muted-foreground",
											)}
										>
											{body}
										</p>
									)}
									{selected.reportCount > 1 && (
										<p className="mt-2 text-muted-foreground">
											{selected.reportCount} people reported this.{" "}
											<Link
												to="/p/$projectId/issues/$number"
												params={{ projectId, number: String(selected.number) }}
												className="font-medium text-ink underline-offset-4 hover:underline"
											>
												See every report
											</Link>
										</p>
									)}
								</div>
								{latest && <Screenshot report={latest} />}
								{latest && <ReportLogs report={latest} />}
							</div>

							<aside className="space-y-6 xl:border-l xl:pl-6">
								<div className="space-y-1">
									<p className="text-xs text-muted-foreground">
										Set before accepting
									</p>
									<PriorityPicker
										value={selected.priority}
										onChange={async (priority) => {
											await updateIssueFn({
												data: { projectId, number: selected.number, priority },
											});
											await router.invalidate();
										}}
										className="-ml-2 w-full"
									/>
									<AssigneePicker
										projectId={projectId}
										value={
											selected.assignee
												? {
														type:
															selected.assignee.type === "agent"
																? "agent"
																: "user",
														id: selected.assignee.id ?? "",
														name: selected.assignee.name ?? "",
													}
												: null
										}
										onChange={async (assignee) => {
											await updateIssueFn({
												data: {
													projectId,
													number: selected.number,
													assignee: assignee
														? { type: assignee.type, id: assignee.id }
														: null,
												},
											});
											await router.invalidate();
										}}
										className="-ml-2 w-full"
									/>
								</div>
								{latest ? (
									<ReportFacts report={latest} seenIn={detail.releases} />
								) : (
									<p className="text-muted-foreground">
										This issue was written in the dashboard.
									</p>
								)}
							</aside>
						</div>
					</>
				) : (
					<div className="flex h-full items-center justify-center p-10 text-center text-muted-foreground max-lg:hidden">
						<p>
							All caught up.
							{project && (
								<>
									{" "}
									<Link
										to="/p/$projectId/issues"
										params={{ projectId }}
										className="font-medium text-ink hover:underline"
									>
										See open issues
									</Link>
								</>
							)}
						</p>
					</div>
				)}
			</section>

			<MergeDialog
				projectId={projectId}
				issue={merging ? selected : null}
				onClose={() => setMerging(false)}
				onMerge={(original) => {
					setMerging(false);
					if (!selected) return;
					void decide(`#${selected.number} merged into #${original}`, () =>
						markDuplicateFn({
							data: {
								projectId,
								number: selected.number,
								duplicateOf: original,
							},
						}),
					);
				}}
			/>
		</div>
	);
}
