import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	BotIcon,
	InboxIcon,
	LightbulbIcon,
	ListIcon,
	PlusIcon,
	SettingsIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "#/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "#/components/ui/dialog";
import { searchIssuesFn } from "#/server/fns";
import { IssueNumber, StatusIcon } from "./issue-meta";

export function CommandMenu({
	open,
	onOpenChange,
	projectId,
	onNewIssue,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	onNewIssue: (type: "bug" | "feature") => void;
}) {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [debounced, setDebounced] = useState("");

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(query.trim()), 150);
		return () => clearTimeout(timer);
	}, [query]);
	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	const { data: results = [] } = useQuery({
		queryKey: ["search", projectId, debounced],
		queryFn: () => searchIssuesFn({ data: { projectId, query: debounced } }),
		enabled: open && debounced.length >= 2,
		staleTime: 10_000,
	});

	const go = (action: () => void) => {
		onOpenChange(false);
		action();
	};
	const actions = [
		{
			id: "new-bug",
			label: "New issue",
			icon: PlusIcon,
			shortcut: "C",
			run: () => onNewIssue("bug"),
		},
		{
			id: "new-feature",
			label: "New feature request",
			icon: LightbulbIcon,
			run: () => onNewIssue("feature"),
		},
		{
			id: "triage",
			label: "Go to Triage",
			icon: InboxIcon,
			run: () =>
				navigate({ to: "/p/$projectId/triage", params: { projectId } }),
		},
		{
			id: "issues",
			label: "Go to Issues",
			icon: ListIcon,
			run: () =>
				navigate({ to: "/p/$projectId/issues", params: { projectId } }),
		},
		{
			id: "requests",
			label: "Go to Feature requests",
			icon: LightbulbIcon,
			run: () =>
				navigate({ to: "/p/$projectId/requests", params: { projectId } }),
		},
		{
			id: "settings",
			label: "Project settings",
			icon: SettingsIcon,
			run: () =>
				navigate({ to: "/p/$projectId/settings", params: { projectId } }),
		},
		{
			id: "agents",
			label: "Agents & API",
			icon: BotIcon,
			run: () => navigate({ to: "/agents" }),
		},
	].filter((a) => a.label.toLowerCase().includes(query.trim().toLowerCase()));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
			>
				<DialogTitle className="sr-only">Search</DialogTitle>
				<DialogDescription className="sr-only">
					Search issues or run a command
				</DialogDescription>
				{/* Server results are already ranked, so cmdk must not re-filter them. */}
				<Command shouldFilter={false} className="[&_[cmdk-input-wrapper]]:h-12">
					<CommandInput
						placeholder="Search issues by words or #number, or type a command…"
						value={query}
						onValueChange={setQuery}
					/>
					<CommandList className="max-h-96">
						<CommandEmpty>Nothing matches “{query}”.</CommandEmpty>
						{results.length > 0 && (
							<CommandGroup heading="Issues">
								{results.map((issue) => (
									<CommandItem
										key={issue.id}
										value={`issue-${issue.number}`}
										onSelect={() =>
											go(() =>
												navigate({
													to: "/p/$projectId/issues/$number",
													params: { projectId, number: String(issue.number) },
												}),
											)
										}
									>
										<StatusIcon status={issue.status} />
										<IssueNumber number={issue.number} className="w-10" />
										<span className="truncate">{issue.title}</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{actions.length > 0 && (
							<CommandGroup heading="Commands">
								{actions.map((action) => (
									<CommandItem
										key={action.id}
										value={action.id}
										onSelect={() => go(action.run)}
									>
										<action.icon />
										{action.label}
										{action.shortcut && (
											<CommandShortcut>{action.shortcut}</CommandShortcut>
										)}
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
