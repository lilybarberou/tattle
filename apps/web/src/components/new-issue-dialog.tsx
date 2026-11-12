import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "#/components/ui/dialog";
import { createIssueFn } from "#/server/fns";
import type { IssueStatus } from "#/shared/issues";
import { MarkdownInput } from "./markdown";
import {
	AssigneePicker,
	type AssigneeValue,
	LabelsPicker,
	PriorityPicker,
	StatusPicker,
	TypePicker,
} from "./pickers";

export type NewIssueDefaults = { type?: "bug" | "feature" };

export function NewIssueDialog({
	open,
	onOpenChange,
	project,
	defaults,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	project: { id: string; name: string };
	defaults?: NewIssueDefaults;
}) {
	const navigate = useNavigate();
	const router = useRouter();
	const titleRef = useRef<HTMLInputElement>(null);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [type, setType] = useState<"bug" | "feature">("bug");
	const [status, setStatus] =
		useState<Exclude<IssueStatus, "duplicate">>("backlog");
	const [priority, setPriority] = useState(0);
	const [labels, setLabels] = useState<string[]>([]);
	const [assignee, setAssignee] = useState<AssigneeValue>(null);
	const [pending, setPending] = useState(false);

	// Each opening starts from a blank form, with the type the caller asked for.
	useEffect(() => {
		if (!open) return;
		setTitle("");
		setDescription("");
		setType(defaults?.type ?? "bug");
		setStatus("backlog");
		setPriority(0);
		setLabels([]);
		setAssignee(null);
	}, [open, defaults?.type]);

	const submit = async () => {
		if (!title.trim() || pending) {
			titleRef.current?.focus();
			return;
		}
		setPending(true);
		try {
			const created = await createIssueFn({
				data: {
					projectId: project.id,
					type,
					title: title.trim(),
					description: description.trim() || undefined,
					status,
					priority,
					labels,
					assignee: assignee ? { type: assignee.type, id: assignee.id } : null,
				},
			});
			onOpenChange(false);
			toast.success(`#${created.number} created`, {
				description: created.title,
			});
			await router.invalidate();
			await navigate({
				to: "/p/$projectId/issues/$number",
				params: { projectId: project.id, number: String(created.number) },
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "The issue was not created",
			);
		} finally {
			setPending(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="gap-0 p-0 sm:max-w-2xl"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					titleRef.current?.focus();
				}}
			>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							void submit();
						}
					}}
				>
					<div className="flex items-center gap-2 px-5 pt-4 text-muted-foreground">
						<span className="rounded-md bg-raised px-2 py-0.5 text-xs font-medium text-ink">
							{project.name}
						</span>
						<span aria-hidden>›</span>
						<DialogTitle className="text-sm font-normal text-muted-foreground">
							{type === "bug" ? "New bug" : "New feature request"}
						</DialogTitle>
					</div>
					<DialogDescription className="sr-only">
						Write an issue yourself. It skips Triage unless you choose that
						status.
					</DialogDescription>
					<div className="space-y-1 px-5 pt-3 pb-2">
						<label htmlFor="new-issue-title" className="sr-only">
							Title
						</label>
						<input
							ref={titleRef}
							id="new-issue-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Issue title"
							maxLength={200}
							className="w-full bg-transparent text-lg font-medium outline-none placeholder:text-muted-foreground/70"
						/>
						<label htmlFor="new-issue-description" className="sr-only">
							Description
						</label>
						<MarkdownInput
							id="new-issue-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Add a description: steps to reproduce, what you expected, links…"
							rows={5}
							headerClassName="-mx-2 pt-1 pb-1"
							className="field-sizing-content block min-h-28 w-full resize-none bg-transparent leading-6 outline-none placeholder:text-muted-foreground/70"
							previewClassName="min-h-28 leading-6"
						/>
					</div>
					<div className="flex flex-wrap items-center gap-1 px-4 pb-3">
						<TypePicker
							value={type}
							onChange={setType}
							className="border border-border"
						/>
						<StatusPicker
							value={status}
							onChange={setStatus}
							className="border border-border"
						/>
						<PriorityPicker
							value={priority}
							onChange={setPriority}
							className="border border-border"
						/>
						<AssigneePicker
							projectId={project.id}
							value={assignee}
							onChange={setAssignee}
							className="border border-border"
						/>
						<LabelsPicker
							value={labels}
							onChange={setLabels}
							className="border border-border"
						/>
					</div>
					<div className="flex items-center justify-between gap-3 border-t px-5 py-3">
						<p className="text-xs text-muted-foreground">
							{assignee?.type === "agent"
								? `${assignee.name} gets an issue.updated webhook and can pick it up.`
								: "Issues you write skip Triage."}
						</p>
						<Button type="submit" disabled={pending || !title.trim()}>
							Create issue
							<kbd className="border-white/20 bg-white/10 text-current dark:border-black/20 dark:bg-black/10">
								⌘↵
							</kbd>
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
