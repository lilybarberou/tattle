import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "#/components/ui/dialog";
import { searchIssuesFn } from "#/server/fns";
import type { IssueDto } from "#/server/Issues";
import { IssueNumber, StatusIcon } from "./issue-meta";

/**
 * Picks the original issue for a duplicate. It opens with issues that share
 * words with the duplicate's title, so the usual case is one click.
 */
export function MergeDialog({
	projectId,
	issue,
	onClose,
	onMerge,
}: {
	projectId: string;
	issue: Pick<IssueDto, "number" | "title"> | null;
	onClose: () => void;
	onMerge: (originalNumber: number) => void;
}) {
	const [query, setQuery] = useState("");
	const [debounced, setDebounced] = useState("");
	// Start from an empty search each time another issue is being merged.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on issue change
	useEffect(() => setQuery(""), [issue?.number]);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(query.trim()), 150);
		return () => clearTimeout(timer);
	}, [query]);

	const effective = debounced || issue?.title || "";
	const { data: results = [], isFetching } = useQuery({
		queryKey: ["merge-search", projectId, issue?.number, effective],
		queryFn: () =>
			searchIssuesFn({
				data: { projectId, query: effective, exclude: issue?.number },
			}),
		enabled: issue !== null && effective.length >= 1,
	});

	return (
		<Dialog open={issue !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				showCloseButton={false}
				className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
			>
				<div className="px-4 pt-4 pb-2">
					<DialogTitle className="text-base font-semibold">
						Merge #{issue?.number} into…
					</DialogTitle>
					<DialogDescription className="mt-1">
						Its reports move to the issue you pick, so you keep everyone who hit
						the problem.
					</DialogDescription>
				</div>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search by words or #number"
						value={query}
						onValueChange={setQuery}
					/>
					<CommandList className="max-h-80">
						<CommandEmpty>
							{isFetching ? "Searching…" : "No similar issue. Try other words."}
						</CommandEmpty>
						{results.length > 0 && (
							<CommandGroup heading={debounced ? "Results" : "Similar issues"}>
								{results.map((candidate) => (
									<CommandItem
										key={candidate.id}
										value={String(candidate.number)}
										onSelect={() => onMerge(candidate.number)}
									>
										<StatusIcon status={candidate.status} />
										<IssueNumber number={candidate.number} className="w-10" />
										<span className="flex-1 truncate">{candidate.title}</span>
										<span className="num text-xs text-muted-foreground">
											{candidate.reportCount}{" "}
											{candidate.reportCount === 1 ? "report" : "reports"}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
