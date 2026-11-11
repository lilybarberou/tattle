import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import {
	ChevronDownIcon,
	ChevronRightIcon,
	GitPullRequestIcon,
	Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	Face,
	IssueNumber,
	PRIORITY_META,
	relativeTime,
	STATUS_META,
	StatusIcon,
	TypeIcon,
} from "#/components/issue-meta";
import { MergeDialog } from "#/components/merge-dialog";
import {
	AssigneePicker,
	LabelsPicker,
	PriorityPicker,
	StatusPicker,
} from "#/components/pickers";
import {
	countErrors,
	errorSignal,
	ReportFacts,
	ReportLogs,
	Screenshot,
} from "#/components/report-evidence";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import {
	addCommentFn,
	deleteIssueFn,
	deleteReportFn,
	getIssueFn,
	markDuplicateFn,
	updateIssueFn,
} from "#/server/fns";
import type { IssueDetail, ReportDto } from "#/server/Issues";
import type { IssueStatus } from "#/shared/issues";

export const Route = createFileRoute("/_app/p/$projectId/issues/$number")({
	loader: ({ params }) =>
		getIssueFn({
			data: { projectId: params.projectId, number: Number(params.number) },
		}),
	component: IssuePage,
});

type Patch = Omit<
	Parameters<typeof updateIssueFn>[0]["data"],
	"projectId" | "number"
>;

const describeActivity = (
	action: string,
	data: IssueDetail["activity"][number]["data"],
) => {
	switch (action) {
		case "created":
			return "created the issue";
		case "created_from_report":
			return "opened it from a widget report";
		case "marked_duplicate":
			return `merged it into #${data?.duplicateOf}`;
		case "merged_duplicate":
			return `merged #${data?.from} into this issue`;
		case "report_attached":
			return "attached a report";
		case "updated": {
			const changes = (data?.changes ?? {}) as Record<string, { to: unknown }>;
			return Object.entries(changes)
				.map(([field, change]) => {
					const to = change.to;
					if (field === "status")
						return `moved it to ${STATUS_META[to as IssueStatus]?.label ?? to}`;
					if (field === "priority")
						return `set priority to ${PRIORITY_META[to as number]?.label}`;
					if (field === "labels")
						return (to as string[]).length
							? `labelled it ${(to as string[]).join(", ")}`
							: "removed the labels";
					if (field === "assigneeName")
						return to ? `assigned ${to}` : "unassigned it";
					if (field === "prUrl") return "linked a pull request";
					if (field === "title") return "renamed it";
					if (field === "description") return "edited the description";
					return null;
				})
				.filter(Boolean)
				.join(", ");
		}
		default:
			return action;
	}
};

function ReportBlock({
	report,
	defaultOpen,
	onDelete,
}: {
	report: ReportDto;
	defaultOpen: boolean;
	onDelete: () => Promise<void>;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const [confirming, setConfirming] = useState(false);
	const name = report.reporter?.name || report.reporter?.email || "Anonymous";
	const { errors, failed } = countErrors(report);
	const signal = errorSignal(errors, failed);
	return (
		<article className="rounded-lg border">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-raised"
			>
				{open ? (
					<ChevronDownIcon className="size-4 text-muted-foreground" />
				) : (
					<ChevronRightIcon className="size-4 text-muted-foreground" />
				)}
				<Face
					name={name}
					id={report.reporter?.id ?? report.reporter?.email}
					size={22}
				/>
				<span className="min-w-0 flex-1">
					<span className="font-medium">{name}</span>
					<span className="text-muted-foreground">
						{" "}
						· {relativeTime(report.createdAt)}
					</span>
					{!open && (
						<span className="block truncate text-muted-foreground">
							{report.message}
						</span>
					)}
				</span>
				{signal && (
					<span className="num flex-none rounded-full bg-pill-negative px-2 text-xs font-medium text-pill-negative-ink">
						{signal}
					</span>
				)}
			</button>
			{open && (
				<div className="grid gap-6 border-t px-4 py-4 lg:grid-cols-[minmax(0,1fr)_260px]">
					<div className="min-w-0 space-y-4">
						<div className="flex flex-wrap items-center justify-end gap-2 text-xs">
							{confirming ? (
								<>
									<span className="text-muted-foreground">
										Delete this report, its screenshot and logs?
									</span>
									<Button size="xs" variant="destructive" onClick={onDelete}>
										Delete
									</Button>
									<Button
										size="xs"
										variant="ghost"
										onClick={() => setConfirming(false)}
									>
										Keep
									</Button>
								</>
							) : (
								<Button
									size="xs"
									variant="ghost"
									className="text-muted-foreground"
									onClick={() => setConfirming(true)}
								>
									<Trash2Icon />
									Delete report
								</Button>
							)}
						</div>
						<p className="max-w-[70ch] text-[15px] leading-6 whitespace-pre-wrap">
							{report.message}
						</p>
						<Screenshot report={report} />
						<ReportLogs report={report} />
					</div>
					<ReportFacts report={report} />
				</div>
			)}
		</article>
	);
}

function PropertyRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2">
			<span className="text-muted-foreground">{label}</span>
			<div className="-ml-2 min-w-0">{children}</div>
		</div>
	);
}

function IssuePage() {
	const detail = Route.useLoaderData();
	const { projectId } = Route.useParams();
	const router = useRouter();
	const { issue } = detail;
	const [title, setTitle] = useState(issue.title);
	const [description, setDescription] = useState(issue.description);
	const [comment, setComment] = useState("");
	const [merging, setMerging] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const navigate = useNavigate();
	const [prUrl, setPrUrl] = useState(issue.prUrl ?? "");

	// Navigating between issues reuses this component: resync local fields.
	useEffect(() => {
		setTitle(issue.title);
		setDescription(issue.description);
		setPrUrl(issue.prUrl ?? "");
	}, [issue.title, issue.description, issue.prUrl]);

	const update = async (patch: Patch, success?: string) => {
		try {
			await updateIssueFn({
				data: { projectId, number: issue.number, ...patch },
			});
			if (success) toast.success(success);
			await router.invalidate();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Update failed");
		}
	};

	const sendComment = async () => {
		if (!comment.trim()) return;
		try {
			await addCommentFn({
				data: { projectId, number: issue.number, body: comment },
			});
			setComment("");
			await router.invalidate();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Comment failed");
		}
	};

	const timeline = [
		...detail.comments.map((c) => ({
			kind: "comment" as const,
			at: c.createdAt,
			item: c,
		})),
		...detail.activity.map((a) => ({
			kind: "activity" as const,
			at: a.createdAt,
			item: a,
		})),
	].sort((a, b) => a.at.localeCompare(b.at));

	// The description of a widget issue is its first report's message: show it once.
	const showDescription =
		detail.reports.length === 0 ||
		description.trim() !== detail.reports.at(-1)?.message.trim();

	return (
		<div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_320px]">
			<div className="min-w-0 px-6 pt-4 pb-10 lg:px-10">
				<nav
					aria-label="Breadcrumb"
					className="flex items-center gap-1.5 text-muted-foreground"
				>
					<Link
						to="/p/$projectId/issues"
						params={{ projectId }}
						className="hover:text-ink"
					>
						Issues
					</Link>
					<span aria-hidden>/</span>
					<IssueNumber number={issue.number} />
				</nav>

				{detail.duplicateOf && (
					<p className="mt-4 rounded-md bg-raised px-3 py-2">
						Merged into{" "}
						<Link
							to="/p/$projectId/issues/$number"
							params={{
								projectId,
								number: String(detail.duplicateOf.number),
							}}
							className="font-medium underline-offset-4 hover:underline"
						>
							#{detail.duplicateOf.number} {detail.duplicateOf.title}
						</Link>
						. Its reports live there now.
					</p>
				)}

				<div className="mt-4 flex items-start gap-2">
					<TypeIcon type={issue.type} className="mt-2" />
					<h1 className="min-w-0 flex-1">
						<label htmlFor="issue-title" className="sr-only">
							Title
						</label>
						<textarea
							id="issue-title"
							value={title}
							rows={1}
							onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									e.currentTarget.blur();
								}
							}}
							onBlur={() => {
								if (title.trim() && title.trim() !== issue.title)
									void update({ title: title.trim() });
								else setTitle(issue.title);
							}}
							className="field-sizing-content w-full resize-none rounded-md bg-transparent text-[22px] leading-8 font-semibold tracking-[-0.01em] outline-none hover:bg-raised focus:bg-raised"
						/>
					</h1>
				</div>

				{showDescription && (
					<div className="mt-2">
						<label htmlFor="issue-description" className="sr-only">
							Description
						</label>
						<textarea
							id="issue-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							onBlur={() => {
								if (description !== issue.description)
									void update({ description });
							}}
							placeholder="Add a description…"
							className="field-sizing-content min-h-12 w-full max-w-[75ch] resize-none rounded-md bg-transparent px-0.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground hover:bg-raised focus:bg-raised"
						/>
					</div>
				)}

				{detail.reports.length > 0 && (
					<section aria-labelledby="reports" className="mt-8 space-y-3">
						<h2
							id="reports"
							className="flex items-baseline gap-2 font-semibold"
						>
							Reports
							<span className="num font-normal text-muted-foreground">
								{detail.reports.length}
							</span>
						</h2>
						{detail.reports.map((report, index) => (
							<ReportBlock
								key={report.id}
								report={report}
								defaultOpen={index === 0}
								onDelete={async () => {
									try {
										await deleteReportFn({
											data: { projectId, reportId: report.id },
										});
										toast.success("Report deleted");
										await router.invalidate();
									} catch (error) {
										toast.error(
											error instanceof Error ? error.message : "Not deleted",
										);
									}
								}}
							/>
						))}
					</section>
				)}

				<section aria-labelledby="activity" className="mt-10">
					<h2 id="activity" className="font-semibold">
						Activity
					</h2>
					<ol className="mt-4 space-y-4 border-l pl-5">
						{timeline.map((entry) =>
							entry.kind === "comment" ? (
								<li key={entry.item.id} className="relative">
									<Face
										name={entry.item.author.name}
										id={entry.item.author.id}
										kind={entry.item.author.type}
										size={20}
										className="absolute top-2.5 -left-[31px] ring-4 ring-surface"
									/>
									<div className="rounded-lg border px-4 py-3">
										<p className="text-muted-foreground">
											<span className="font-medium text-ink">
												{entry.item.author.name}
											</span>{" "}
											· {relativeTime(entry.at)}
										</p>
										<p className="mt-1 whitespace-pre-wrap">
											{entry.item.body}
										</p>
									</div>
								</li>
							) : (
								<li
									key={entry.item.id}
									className="relative text-muted-foreground"
								>
									<span className="absolute top-1.5 -left-[24.5px] size-2 rounded-full bg-control ring-4 ring-surface" />
									<span className="font-medium text-ink">
										{entry.item.actor.name}
									</span>{" "}
									{describeActivity(entry.item.action, entry.item.data)}
									<span> · {relativeTime(entry.at)}</span>
								</li>
							),
						)}
					</ol>
					<form
						className="mt-5 rounded-lg border focus-within:border-control"
						onSubmit={(event) => {
							event.preventDefault();
							void sendComment();
						}}
					>
						<label htmlFor="comment" className="sr-only">
							Comment
						</label>
						<textarea
							id="comment"
							value={comment}
							onChange={(e) => setComment(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									void sendComment();
								}
							}}
							placeholder="Leave a comment… your agent reads these too."
							className="field-sizing-content block min-h-20 w-full resize-none bg-transparent px-4 py-3 outline-none placeholder:text-muted-foreground"
						/>
						<div className="flex justify-end px-3 pb-3">
							<Button type="submit" size="sm" disabled={!comment.trim()}>
								Comment
								<kbd className="border-white/20 bg-white/10 text-current dark:border-black/20 dark:bg-black/10">
									⌘↵
								</kbd>
							</Button>
						</div>
					</form>
				</section>
			</div>

			<aside className="border-l bg-surface px-5 py-5 max-lg:order-first max-lg:border-b max-lg:border-l-0">
				<div className="space-y-1 lg:sticky lg:top-5">
					<PropertyRow label="Status">
						<StatusPicker
							value={issue.status}
							onChange={(status) => update({ status })}
							className="w-full"
						/>
					</PropertyRow>
					<PropertyRow label="Priority">
						<PriorityPicker
							value={issue.priority}
							onChange={(priority) => update({ priority })}
							className="w-full"
						/>
					</PropertyRow>
					<PropertyRow label="Assignee">
						<AssigneePicker
							projectId={projectId}
							value={
								issue.assignee
									? {
											type: issue.assignee.type === "agent" ? "agent" : "user",
											id: issue.assignee.id ?? "",
											name: issue.assignee.name ?? "",
										}
									: null
							}
							onChange={(assignee) =>
								update(
									{
										assignee: assignee
											? { type: assignee.type, id: assignee.id }
											: null,
									},
									assignee?.type === "agent"
										? `${assignee.name} was notified`
										: undefined,
								)
							}
							className="w-full"
						/>
					</PropertyRow>
					<PropertyRow label="Labels">
						<LabelsPicker
							value={issue.labels}
							onChange={(labels) => update({ labels })}
							className="w-full"
						/>
					</PropertyRow>
					<PropertyRow label="Pull request">
						{issue.prUrl ? (
							<a
								href={issue.prUrl}
								target="_blank"
								rel="noreferrer"
								className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 hover:bg-active"
							>
								<GitPullRequestIcon className="size-4 flex-none text-state-review" />
								<span className="truncate">
									{issue.prUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
								</span>
							</a>
						) : (
							<input
								aria-label="Pull request URL"
								value={prUrl}
								onChange={(e) => setPrUrl(e.target.value)}
								onBlur={() => {
									if (prUrl.trim() && /^https?:\/\//.test(prUrl.trim()))
										void update({ prUrl: prUrl.trim() });
								}}
								placeholder="Paste a link"
								className="h-8 w-full rounded-md bg-transparent px-2 outline-none placeholder:text-muted-foreground hover:bg-active focus:bg-active"
							/>
						)}
					</PropertyRow>

					<dl className="mt-4 space-y-2 border-t pt-4">
						{[
							["Type", issue.type === "bug" ? "Bug" : "Feature request"],
							[
								"Reported by",
								`${issue.reportCount} ${issue.reportCount === 1 ? "person" : "people"}`,
							],
							["Opened", relativeTime(issue.createdAt)],
							["Updated", relativeTime(issue.updatedAt)],
						].map(([label, value]) => (
							<div
								key={label}
								className="grid grid-cols-[84px_minmax(0,1fr)] gap-2"
							>
								<dt className="text-muted-foreground">{label}</dt>
								<dd className="num">{value}</dd>
							</div>
						))}
					</dl>

					{issue.status !== "duplicate" && (
						<div className="mt-4 border-t pt-4">
							<Button
								variant="ghost"
								className={cn("-ml-2 text-muted-foreground")}
								onClick={() => setMerging(true)}
							>
								<StatusIcon status="duplicate" />
								Merge into another issue…
							</Button>
						</div>
					)}
					<div className="mt-1">
						{deleting ? (
							<div className="space-y-2 rounded-lg border border-negative/30 p-3">
								<p>
									Delete #{issue.number} with its {issue.reportCount}{" "}
									{issue.reportCount === 1 ? "report" : "reports"}, screenshots
									and comments? This cannot be undone.
								</p>
								<div className="flex gap-2">
									<Button
										size="sm"
										variant="destructive"
										onClick={async () => {
											try {
												await deleteIssueFn({
													data: { projectId, number: issue.number },
												});
												toast.success(`#${issue.number} deleted`);
												await navigate({
													to: "/p/$projectId/issues",
													params: { projectId },
												});
											} catch (error) {
												toast.error(
													error instanceof Error
														? error.message
														: "Not deleted",
												);
											}
										}}
									>
										Delete
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setDeleting(false)}
									>
										Keep it
									</Button>
								</div>
							</div>
						) : (
							<Button
								variant="ghost"
								className="-ml-2 text-muted-foreground"
								onClick={() => setDeleting(true)}
							>
								<Trash2Icon className="size-4" />
								Delete issue…
							</Button>
						)}
					</div>
				</div>
			</aside>

			<MergeDialog
				projectId={projectId}
				issue={merging ? issue : null}
				onClose={() => setMerging(false)}
				onMerge={async (original) => {
					setMerging(false);
					try {
						await markDuplicateFn({
							data: { projectId, number: issue.number, duplicateOf: original },
						});
						toast.success(`#${issue.number} merged into #${original}`);
						await router.invalidate();
					} catch (error) {
						toast.error(
							error instanceof Error ? error.message : "Merge failed",
						);
					}
				}}
			/>
		</div>
	);
}
