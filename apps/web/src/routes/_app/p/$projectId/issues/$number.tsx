import {
	createFileRoute,
	getRouteApi,
	Link,
	notFound,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import {
	ChevronDownIcon,
	ChevronRightIcon,
	GitPullRequestIcon,
	MessageCircleIcon,
	PencilIcon,
	SearchIcon,
	SendIcon,
	Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DuplicateSuggestion } from "#/components/duplicate-suggestion";
import {
	Face,
	IssueNumber,
	StatusIcon,
	TypeIcon,
} from "#/components/issue-meta";
import { Markdown, MarkdownInput } from "#/components/markdown";
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
	SeenIn,
} from "#/components/report-evidence";
import { errorStatus } from "#/components/status-page";
import { RelativeTime } from "#/components/time";
import { Button } from "#/components/ui/button";
import type { Messages } from "#/i18n";
import { useI18n } from "#/i18n/react";
import { useInlineConfirm } from "#/lib/use-inline-confirm";
import { cn } from "#/lib/utils";
import {
	addCommentFn,
	deleteIssueFn,
	deleteReportFn,
	dismissDuplicateFn,
	findDuplicatesFn,
	getIssueFn,
	markDuplicateFn,
	replyToReporterFn,
	updateIssueFn,
} from "#/server/fns";
import type { IssueDetail, ReportDto } from "#/server/Issues";
import {
	ISSUE_STATUSES,
	type IssueStatus,
	PRIORITY_LABELS,
} from "#/shared/issues";

export const Route = createFileRoute("/_app/p/$projectId/issues/$number")({
	loader: async ({ params }) => {
		try {
			return await getIssueFn({
				data: { projectId: params.projectId, number: Number(params.number) },
			});
		} catch (error) {
			// A wrong or deleted number: the "doesn't exist" page, not an error.
			if (errorStatus(error) === 404) throw notFound();
			throw error;
		}
	},
	component: IssuePage,
});

type Patch = Omit<
	Parameters<typeof updateIssueFn>[0]["data"],
	"projectId" | "number"
>;

/** What an activity entry says after the actor's name, in the reader's language. */
const describeActivity = (
	m: Messages,
	action: string,
	data: IssueDetail["activity"][number]["data"],
) => {
	const a = m.issues.activity;
	switch (action) {
		case "created":
			return a.created;
		case "created_from_report":
			return a.createdFromReport;
		case "marked_duplicate":
			return a.markedDuplicate(String(data?.duplicateOf));
		case "merged_duplicate":
			return a.mergedDuplicate(String(data?.from));
		case "report_attached":
			return a.reportAttached;
		case "dismissed_duplicate":
			return a.dismissedDuplicate(String(data?.suggested));
		case "regressed":
			return data?.release ? a.regressedIn(String(data.release)) : a.regressed;
		case "updated": {
			const changes = (data?.changes ?? {}) as Record<string, { to: unknown }>;
			return Object.entries(changes)
				.map(([field, change]) => {
					const to = change.to;
					if (field === "status")
						return a.movedTo(
							(ISSUE_STATUSES as readonly unknown[]).includes(to)
								? m.common.status[to as IssueStatus]
								: String(to),
						);
					if (field === "priority")
						return a.setPriority(
							m.common.priority[PRIORITY_LABELS[to as number] ?? "none"],
						);
					if (field === "labels")
						return (to as string[]).length
							? a.labelled((to as string[]).join(", "))
							: a.removedLabels;
					if (field === "assigneeName")
						return to ? a.assigned(String(to)) : a.unassigned;
					if (field === "prUrl") return a.linkedPullRequest;
					if (field === "title") return a.renamed;
					if (field === "description") return a.editedDescription;
					return null;
				})
				.filter(Boolean)
				.join(a.separator);
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
	/** Only for owners and admins: deleting cannot be undone. */
	onDelete?: () => Promise<void>;
}) {
	const { m, locale } = useI18n();
	const [open, setOpen] = useState(defaultOpen);
	const { confirming, setConfirming, trigger, cancel } = useInlineConfirm();
	const name =
		report.reporter?.name || report.reporter?.email || m.issues.page.anonymous;
	const { errors, failed } = countErrors(report);
	const signal = errorSignal(errors, failed, locale);
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
						· <RelativeTime iso={report.createdAt} />
					</span>
					{!open && (
						<span className="block truncate text-muted-foreground">
							{report.message}
						</span>
					)}
				</span>
				{report.awaitingReply && (
					<span className="flex flex-none items-center gap-1 rounded-full bg-brand-soft px-2 text-xs font-medium text-brand">
						<MessageCircleIcon className="size-3" />
						{m.issues.page.waitingForReply}
					</span>
				)}
				{signal && (
					<span className="num flex-none rounded-full bg-pill-negative px-2 text-xs font-medium text-pill-negative-ink">
						{signal}
					</span>
				)}
			</button>
			{open && (
				<div className="grid gap-6 border-t px-4 py-4 lg:grid-cols-[minmax(0,1fr)_260px]">
					<div className="min-w-0 space-y-4">
						{onDelete && (
							<div className="flex flex-wrap items-center justify-end gap-2 text-xs">
								{confirming ? (
									<>
										<span className="text-muted-foreground">
											{m.issues.page.deleteReportConfirm}
										</span>
										<Button size="xs" variant="destructive" onClick={onDelete}>
											{m.common.actions.delete}
										</Button>
										<Button
											ref={cancel}
											size="xs"
											variant="ghost"
											onClick={() => setConfirming(false)}
										>
											{m.issues.page.keep}
										</Button>
									</>
								) : (
									<Button
										ref={trigger}
										size="xs"
										variant="ghost"
										className="text-muted-foreground"
										onClick={() => setConfirming(true)}
									>
										<Trash2Icon />
										{m.issues.page.deleteReport}
									</Button>
								)}
							</div>
						)}
						<p className="max-w-[70ch] text-[15px] leading-6 whitespace-pre-wrap">
							{report.message}
						</p>
						<Screenshot report={report} />
						<ReportLogs report={report} />
						<ReporterThread report={report} name={name} />
					</div>
					<ReportFacts report={report} />
				</div>
			)}
		</article>
	);
}

/** The description, shown as Markdown; Edit opens a Write / Preview editor. */
function Description({
	value,
	onSave,
}: {
	value: string;
	onSave: (description: string) => Promise<boolean>;
}) {
	const { m } = useI18n();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const [saving, setSaving] = useState(false);

	const edit = () => {
		setDraft(value);
		setEditing(true);
	};
	const save = async () => {
		if (saving) return;
		if (draft === value) return setEditing(false);
		setSaving(true);
		const saved = await onSave(draft);
		setSaving(false);
		if (saved) setEditing(false);
	};

	if (!editing)
		return value.trim() ? (
			<div className="mt-2 flex max-w-[75ch] items-start gap-2">
				<Markdown className="min-w-0 max-w-[70ch] flex-1 px-0.5 text-[15px] leading-6">
					{value}
				</Markdown>
				<Button
					size="icon-xs"
					variant="ghost"
					className="flex-none text-muted-foreground"
					aria-label={m.issues.page.editDescription}
					title={m.issues.page.editDescription}
					onClick={edit}
				>
					<PencilIcon />
				</Button>
			</div>
		) : (
			<button
				type="button"
				onClick={edit}
				className="mt-2 block min-h-12 w-full max-w-[75ch] rounded-md px-0.5 text-left text-[15px] leading-6 text-muted-foreground hover:bg-raised"
			>
				{m.issues.page.addDescription}
			</button>
		);

	return (
		<form
			className="mt-2 max-w-[75ch] rounded-lg border transition-[color,box-shadow] focus-within:border-control has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
			onSubmit={(event) => {
				event.preventDefault();
				void save();
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
					event.preventDefault();
					void save();
				} else if (event.key === "Escape") {
					event.preventDefault();
					setEditing(false);
				}
			}}
		>
			<label htmlFor="issue-description" className="sr-only">
				{m.issues.page.description}
			</label>
			<MarkdownInput
				id="issue-description"
				autoFocus
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				placeholder={m.issues.page.addDescription}
				headerClassName="px-2 pt-2"
				className="field-sizing-content block min-h-24 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
				previewClassName="min-h-24 px-3 py-2 text-[15px] leading-6"
			/>
			<div className="flex justify-end gap-2 px-3 pb-3">
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => setEditing(false)}
				>
					{m.common.actions.cancel}
				</Button>
				<Button type="submit" size="sm" disabled={saving}>
					{m.common.actions.save}
					<kbd className="border-white/20 bg-white/10 text-current dark:border-black/20 dark:bg-black/10">
						⌘↵
					</kbd>
				</Button>
			</div>
		</form>
	);
}

/**
 * The conversation with the person who sent the report. Everything here is
 * visible to them, unlike the comments under Activity. Their messages are
 * shown as plain text: they are written by anyone using the app.
 */
function ReporterThread({ report, name }: { report: ReportDto; name: string }) {
	const { m } = useI18n();
	const { projectId } = Route.useParams();
	const router = useRouter();
	const [body, setBody] = useState("");
	const [sending, setSending] = useState(false);
	const { inApp, email } = report.reachable;
	const reachable = inApp || email;

	const send = async () => {
		if (!body.trim() || sending) return;
		setSending(true);
		try {
			await replyToReporterFn({
				data: { projectId, reportId: report.id, body },
			});
			setBody("");
			toast.success(m.issues.page.sentTo(name));
			await router.invalidate();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : m.common.errors.notSent,
			);
		} finally {
			setSending(false);
		}
	};

	return (
		<section
			aria-label={m.issues.page.conversationWith(name)}
			className="space-y-3"
		>
			<h3 className="flex flex-wrap items-baseline gap-x-2 font-medium">
				{m.issues.page.conversationWith(name)}
				<span className="text-xs font-normal text-muted-foreground">
					{!reachable
						? m.issues.page.cantReceive
						: inApp && email
							? m.issues.page.appAndEmail
							: inApp
								? m.issues.page.appOnly
								: m.issues.page.emailOnly}
				</span>
			</h3>
			{report.messages.length > 0 && (
				<ol className="space-y-2">
					{report.messages.map((message) => (
						<li
							key={message.id}
							className={cn(
								"max-w-[85%] rounded-lg px-3 py-2",
								message.from === "team"
									? "ml-auto bg-brand-soft"
									: "border bg-surface",
							)}
						>
							<p className="text-xs text-muted-foreground">
								<span className="font-medium text-ink">
									{message.from === "team" ? message.author.name : name}
								</span>
								{message.from === "team" &&
									(message.readAt ? m.issues.page.seen : m.issues.page.notSeen)}
								{" · "}
								<RelativeTime iso={message.createdAt} />
							</p>
							<p className="mt-0.5 break-words whitespace-pre-wrap">
								{message.body}
							</p>
						</li>
					))}
				</ol>
			)}
			{reachable ? (
				<form
					className="rounded-lg border border-brand/40 transition-[color,box-shadow] focus-within:border-brand has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
					onSubmit={(event) => {
						event.preventDefault();
						void send();
					}}
				>
					<label htmlFor={`reply-${report.id}`} className="sr-only">
						{m.issues.page.replyTo(name)}
					</label>
					<textarea
						id={`reply-${report.id}`}
						value={body}
						maxLength={5000}
						onChange={(e) => setBody(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								void send();
							}
						}}
						placeholder={m.issues.page.writeTo(name)}
						className="field-sizing-content block min-h-16 w-full resize-none bg-transparent px-3 py-2.5 outline-none placeholder:text-muted-foreground"
					/>
					<div className="flex items-center justify-between gap-2 px-3 pb-2.5">
						<span className="text-xs text-muted-foreground">
							{m.issues.page.visibleToReporter}
						</span>
						<Button type="submit" size="sm" disabled={!body.trim() || sending}>
							<SendIcon />
							{m.issues.page.replyToReporter}
						</Button>
					</div>
				</form>
			) : (
				<p className="text-muted-foreground">{m.issues.page.unreachable}</p>
			)}
		</section>
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

const projectRoute = getRouteApi("/_app/p/$projectId");

function IssuePage() {
	const { m } = useI18n();
	const p = m.issues.page;
	const detail = Route.useLoaderData();
	const { canManage } = projectRoute.useLoaderData();
	const { projectId } = Route.useParams();
	const router = useRouter();
	const { issue } = detail;
	const [title, setTitle] = useState(issue.title);
	const [comment, setComment] = useState("");
	const [merging, setMerging] = useState(false);
	const {
		confirming: deleting,
		setConfirming: setDeleting,
		trigger: deleteTrigger,
		cancel: keepIssue,
	} = useInlineConfirm();
	const [checking, setChecking] = useState(false);
	const navigate = useNavigate();
	const [prUrl, setPrUrl] = useState(issue.prUrl ?? "");

	// Navigating between issues reuses this component: resync local fields.
	useEffect(() => {
		setTitle(issue.title);
		setPrUrl(issue.prUrl ?? "");
	}, [issue.title, issue.prUrl]);

	const update = async (patch: Patch, success?: string) => {
		try {
			await updateIssueFn({
				data: { projectId, number: issue.number, ...patch },
			});
			if (success) toast.success(success);
			await router.invalidate();
			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : p.updateFailed);
			return false;
		}
	};

	const merge = async (original: number) => {
		try {
			await markDuplicateFn({
				data: { projectId, number: issue.number, duplicateOf: original },
			});
			toast.success(p.merged(issue.number, original));
			await router.invalidate();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : p.mergeFailed);
		}
	};

	const findDuplicates = async () => {
		if (checking) return;
		setChecking(true);
		try {
			const found = await findDuplicatesFn({
				data: { projectId, number: issue.number },
			});
			if (!found) toast.success(p.noDuplicate);
			await router.invalidate();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : p.searchFailed);
		} finally {
			setChecking(false);
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
			toast.error(error instanceof Error ? error.message : p.commentFailed);
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
		issue.description.trim() !== detail.reports.at(-1)?.message.trim();

	return (
		<div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_320px]">
			<div className="min-w-0 px-6 pt-4 pb-10 lg:px-10">
				<nav
					aria-label={p.breadcrumb}
					className="flex items-center gap-1.5 text-muted-foreground"
				>
					<Link
						to="/p/$projectId/issues"
						params={{ projectId }}
						className="hover:text-ink"
					>
						{p.issues}
					</Link>
					<span aria-hidden>/</span>
					<IssueNumber number={issue.number} />
				</nav>

				{detail.duplicateOf && (
					<p className="mt-4 rounded-md bg-raised px-3 py-2">
						{p.mergedInto}{" "}
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
						{p.reportsLiveThere}
					</p>
				)}

				{detail.duplicateSuggestion && (
					<DuplicateSuggestion
						className="mt-4"
						projectId={projectId}
						suggestion={detail.duplicateSuggestion}
						busy={checking}
						onMerge={() => {
							const original = detail.duplicateSuggestion?.issue.number;
							if (original !== undefined) void merge(original);
						}}
						onDismiss={async () => {
							try {
								await dismissDuplicateFn({
									data: { projectId, number: issue.number },
								});
								await router.invalidate();
							} catch (error) {
								toast.error(
									error instanceof Error
										? error.message
										: m.common.errors.notSaved,
								);
							}
						}}
					/>
				)}

				<div className="mt-4 flex items-start gap-2">
					<TypeIcon type={issue.type} className="mt-2" />
					<h1 className="min-w-0 flex-1">
						<label htmlFor="issue-title" className="sr-only">
							{p.title}
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
							className="field-sizing-content w-full resize-none rounded-md bg-transparent text-[22px] leading-8 font-semibold tracking-[-0.01em] outline-none hover:bg-raised focus:bg-raised focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
					</h1>
				</div>

				{showDescription && (
					<Description
						key={issue.id}
						value={issue.description}
						onSave={(description) => update({ description })}
					/>
				)}

				{detail.reports.length > 0 && (
					<section aria-labelledby="reports" className="mt-8 space-y-3">
						<h2
							id="reports"
							className="flex items-baseline gap-2 font-semibold"
						>
							{p.reports}
							<span className="num font-normal text-muted-foreground">
								{detail.reports.length}
							</span>
						</h2>
						{detail.reports.map((report, index) => (
							<ReportBlock
								key={report.id}
								report={report}
								defaultOpen={index === 0 || report.awaitingReply}
								onDelete={
									canManage
										? async () => {
												try {
													await deleteReportFn({
														data: { projectId, reportId: report.id },
													});
													toast.success(p.reportDeleted);
													await router.invalidate();
												} catch (error) {
													toast.error(
														error instanceof Error
															? error.message
															: p.notDeleted,
													);
												}
											}
										: undefined
								}
							/>
						))}
					</section>
				)}

				<section aria-labelledby="activity" className="mt-10">
					<h2 id="activity" className="font-semibold">
						{p.activity}
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
											· <RelativeTime iso={entry.at} />
										</p>
										<Markdown className="mt-1">{entry.item.body}</Markdown>
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
									<span
										className={cn(
											entry.item.action === "regressed" &&
												"font-medium text-negative",
										)}
									>
										{describeActivity(m, entry.item.action, entry.item.data)}
									</span>
									<span>
										{" "}
										· <RelativeTime iso={entry.at} />
									</span>
								</li>
							),
						)}
					</ol>
					<form
						className="mt-5 rounded-lg border transition-[color,box-shadow] focus-within:border-control has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
						onSubmit={(event) => {
							event.preventDefault();
							void sendComment();
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								void sendComment();
							}
						}}
					>
						<label htmlFor="comment" className="sr-only">
							{p.comment}
						</label>
						<MarkdownInput
							id="comment"
							value={comment}
							onChange={(e) => setComment(e.target.value)}
							placeholder={p.commentPlaceholder}
							headerClassName="px-2 pt-2"
							className="field-sizing-content block min-h-20 w-full resize-none bg-transparent px-4 py-3 outline-none placeholder:text-muted-foreground"
							previewClassName="min-h-20 px-4 py-3"
						/>
						<div className="flex justify-end px-3 pb-3">
							<Button type="submit" size="sm" disabled={!comment.trim()}>
								{p.comment}
								<kbd className="border-white/20 bg-white/10 text-current dark:border-black/20 dark:bg-black/10">
									⌘↵
								</kbd>
							</Button>
						</div>
					</form>
				</section>
			</div>

			<aside
				aria-label={p.properties}
				className="border-l bg-surface px-5 py-5 max-lg:order-first max-lg:border-b max-lg:border-l-0"
			>
				<div className="space-y-1 lg:sticky lg:top-5">
					<PropertyRow label={p.status}>
						<StatusPicker
							value={issue.status}
							onChange={(status) => update({ status })}
							className="w-full"
						/>
					</PropertyRow>
					<PropertyRow label={p.priority}>
						<PriorityPicker
							value={issue.priority}
							onChange={(priority) => update({ priority })}
							className="w-full"
						/>
					</PropertyRow>
					<PropertyRow label={p.assignee}>
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
										? p.agentNotified(assignee.name)
										: undefined,
								)
							}
							className="w-full"
						/>
					</PropertyRow>
					<PropertyRow label={p.labels}>
						<LabelsPicker
							value={issue.labels}
							onChange={(labels) => update({ labels })}
							className="w-full"
						/>
					</PropertyRow>
					<PropertyRow label={p.pullRequest}>
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
								aria-label={p.pullRequestUrl}
								value={prUrl}
								onChange={(e) => setPrUrl(e.target.value)}
								onBlur={() => {
									if (prUrl.trim() && /^https?:\/\//.test(prUrl.trim()))
										void update({ prUrl: prUrl.trim() });
								}}
								placeholder={p.pasteLink}
								className="h-8 w-full rounded-md bg-transparent px-2 outline-none placeholder:text-muted-foreground hover:bg-active focus:bg-active focus-visible:ring-[3px] focus-visible:ring-ring/50"
							/>
						)}
					</PropertyRow>

					<dl className="mt-4 space-y-2 border-t pt-4">
						{(
							[
								[p.type, m.common.type[issue.type]],
								[p.reportedBy, p.people(issue.reportCount)],
								...(detail.releases.length > 0
									? [
											[
												p.seenIn,
												<SeenIn key="seen" releases={detail.releases} />,
											],
										]
									: []),
								[p.opened, <RelativeTime key="o" iso={issue.createdAt} />],
								[p.updated, <RelativeTime key="u" iso={issue.updatedAt} />],
							] as Array<[string, React.ReactNode]>
						).map(([label, value]) => (
							<div
								key={label}
								className="grid grid-cols-[84px_minmax(0,1fr)] gap-2"
							>
								<dt className="text-muted-foreground">{label}</dt>
								<dd className="num min-w-0">{value}</dd>
							</div>
						))}
					</dl>

					{issue.status !== "duplicate" && (
						<div className="mt-4 flex flex-col items-start border-t pt-4">
							<Button
								variant="ghost"
								className="-ml-2 text-muted-foreground"
								onClick={findDuplicates}
								disabled={checking}
							>
								<SearchIcon className="size-4" />
								{checking ? p.lookingForDuplicates : p.findDuplicates}
							</Button>
							<Button
								variant="ghost"
								className={cn("-ml-2 text-muted-foreground")}
								onClick={() => setMerging(true)}
							>
								<StatusIcon status="duplicate" />
								{p.mergeInto}
							</Button>
						</div>
					)}
					{canManage && (
						<div className="mt-1">
							{deleting ? (
								<div className="space-y-2 rounded-lg border border-negative/30 p-3">
									<p>{p.deleteConfirm(issue.number, issue.reportCount)}</p>
									<div className="flex gap-2">
										<Button
											size="sm"
											variant="destructive"
											onClick={async () => {
												try {
													await deleteIssueFn({
														data: { projectId, number: issue.number },
													});
													toast.success(p.deleted(issue.number));
													await navigate({
														to: "/p/$projectId/issues",
														params: { projectId },
													});
												} catch (error) {
													toast.error(
														error instanceof Error
															? error.message
															: p.notDeleted,
													);
												}
											}}
										>
											{m.common.actions.delete}
										</Button>
										<Button
											ref={keepIssue}
											size="sm"
											variant="ghost"
											onClick={() => setDeleting(false)}
										>
											{p.keepIt}
										</Button>
									</div>
								</div>
							) : (
								<Button
									ref={deleteTrigger}
									variant="ghost"
									className="-ml-2 text-muted-foreground"
									onClick={() => setDeleting(true)}
								>
									<Trash2Icon className="size-4" />
									{p.deleteIssue}
								</Button>
							)}
						</div>
					)}
				</div>
			</aside>

			<MergeDialog
				projectId={projectId}
				issue={merging ? issue : null}
				onClose={() => setMerging(false)}
				onMerge={(original) => {
					setMerging(false);
					void merge(original);
				}}
			/>
		</div>
	);
}
