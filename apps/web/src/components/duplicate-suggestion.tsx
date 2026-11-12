import { Link } from "@tanstack/react-router";
import { MergeIcon, SparklesIcon, TextSearchIcon, XIcon } from "lucide-react";
import { StatusIcon } from "#/components/issue-meta";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import type { DuplicateSuggestionView } from "#/shared/ai";
import type { IssueStatus } from "#/shared/issues";

/**
 * "Looks like #12 Checkout fails — <reason>", with Merge and Not a duplicate.
 * Only a hint: nothing moves until someone merges.
 */
export function DuplicateSuggestion({
	projectId,
	suggestion,
	busy,
	onMerge,
	onDismiss,
	className,
}: {
	projectId: string;
	suggestion: DuplicateSuggestionView;
	busy?: boolean;
	onMerge: () => void;
	onDismiss: () => void;
	className?: string;
}) {
	const { issue } = suggestion;
	const SourceIcon = suggestion.source === "ai" ? SparklesIcon : TextSearchIcon;
	return (
		<aside
			aria-label="Possible duplicate"
			className={cn(
				"flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-brand/30 bg-brand-soft px-4 py-3",
				className,
			)}
		>
			<SourceIcon className="mt-0.5 size-4 flex-none text-brand" aria-hidden />
			<div className="min-w-0 flex-1 basis-64">
				<p className="text-pretty">
					Looks like{" "}
					<Link
						to="/p/$projectId/issues/$number"
						params={{ projectId, number: String(issue.number) }}
						className="inline-flex max-w-full items-baseline gap-1 font-medium underline-offset-4 hover:underline"
					>
						<StatusIcon
							status={issue.status as IssueStatus}
							className="relative top-0.5"
						/>
						<span className="num">#{issue.number}</span>
						<span className="truncate">{issue.title}</span>
					</Link>
				</p>
				<p className="mt-0.5 text-muted-foreground text-pretty">
					{suggestion.reason}
					<span className="text-xs">
						{" "}
						·{" "}
						{suggestion.source === "ai"
							? "suggested by your AI"
							: "near-identical wording"}
					</span>
				</p>
			</div>
			<div className="flex flex-none flex-wrap gap-2">
				<Button size="sm" variant="outline" onClick={onMerge} disabled={busy}>
					<MergeIcon />
					Merge into #{issue.number}
				</Button>
				<Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
					<XIcon />
					Not a duplicate
				</Button>
			</div>
		</aside>
	);
}
