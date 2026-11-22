import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	BotIcon,
	ChartColumnIcon,
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
import { useI18n } from "#/i18n/react";
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
	const { m } = useI18n();
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
			label: m.app.command.newIssue,
			icon: PlusIcon,
			shortcut: "C",
			run: () => onNewIssue("bug"),
		},
		{
			id: "new-feature",
			label: m.app.command.newFeature,
			icon: LightbulbIcon,
			run: () => onNewIssue("feature"),
		},
		{
			id: "triage",
			label: m.app.command.goTriage,
			icon: InboxIcon,
			run: () =>
				navigate({ to: "/p/$projectId/triage", params: { projectId } }),
		},
		{
			id: "issues",
			label: m.app.command.goIssues,
			icon: ListIcon,
			run: () =>
				navigate({ to: "/p/$projectId/issues", params: { projectId } }),
		},
		{
			id: "requests",
			label: m.app.command.goRequests,
			icon: LightbulbIcon,
			run: () =>
				navigate({ to: "/p/$projectId/requests", params: { projectId } }),
		},
		{
			id: "overview",
			label: m.app.command.goOverview,
			icon: ChartColumnIcon,
			run: () =>
				navigate({ to: "/p/$projectId/overview", params: { projectId } }),
		},
		{
			id: "settings",
			label: m.app.command.projectSettings,
			icon: SettingsIcon,
			run: () =>
				navigate({ to: "/p/$projectId/settings", params: { projectId } }),
		},
		{
			id: "agents",
			label: m.app.command.agents,
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
				<DialogTitle className="sr-only">{m.app.command.title}</DialogTitle>
				<DialogDescription className="sr-only">
					{m.app.command.description}
				</DialogDescription>
				{/* Server results are already ranked, so cmdk must not re-filter them. */}
				<Command shouldFilter={false} className="[&_[cmdk-input-wrapper]]:h-12">
					<CommandInput
						placeholder={m.app.command.placeholder}
						value={query}
						onValueChange={setQuery}
					/>
					<CommandList className="max-h-96">
						<CommandEmpty>{m.app.command.empty(query)}</CommandEmpty>
						{results.length > 0 && (
							<CommandGroup heading={m.app.command.issues}>
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
							<CommandGroup heading={m.app.command.commands}>
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
