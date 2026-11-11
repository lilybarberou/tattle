import { useQuery } from "@tanstack/react-query";
import { CheckIcon, PlusIcon, TagIcon, UserRoundXIcon } from "lucide-react";
import { useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { cn } from "#/lib/utils";
import { listAssigneesFn } from "#/server/fns";
import { ISSUE_STATUSES, type IssueStatus } from "#/shared/issues";
import {
	Face,
	LabelChip,
	PRIORITY_META,
	PriorityIcon,
	STATUS_META,
	StatusIcon,
	TypeIcon,
} from "./issue-meta";

export type AssigneeValue = {
	type: "user" | "agent";
	id: string;
	name: string;
} | null;

/** The pill-shaped button every property picker opens from. */
function Trigger({
	children,
	className,
	...props
}: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			className={cn(
				"inline-flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm text-ink hover:bg-active focus-visible:outline-2 data-[state=open]:bg-active",
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}

function Picker({
	trigger,
	label,
	children,
	open,
	onOpenChange,
	searchable = true,
	placeholder,
}: {
	trigger: React.ReactNode;
	label: string;
	children: React.ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	searchable?: boolean;
	placeholder?: string;
}) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent className="w-60 p-0" align="start">
				<Command label={label}>
					{searchable && (
						<CommandInput placeholder={placeholder ?? `${label}…`} />
					)}
					<CommandList>{children}</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

export function StatusPicker({
	value,
	onChange,
	className,
	allowTriage = true,
}: {
	value: IssueStatus;
	onChange: (status: Exclude<IssueStatus, "duplicate">) => void;
	className?: string;
	allowTriage?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const choices = ISSUE_STATUSES.filter(
		(s) => s !== "duplicate" && (allowTriage || s !== "triage"),
	) as Exclude<IssueStatus, "duplicate">[];
	return (
		<Picker
			label="Change status"
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Trigger className={className} disabled={value === "duplicate"}>
					<StatusIcon status={value} />
					<span className="truncate">{STATUS_META[value].label}</span>
				</Trigger>
			}
		>
			<CommandGroup>
				{choices.map((status) => (
					<CommandItem
						key={status}
						value={STATUS_META[status].label}
						onSelect={() => {
							onChange(status);
							setOpen(false);
						}}
					>
						<StatusIcon status={status} />
						<span className="flex-1">{STATUS_META[status].label}</span>
						{value === status && <CheckIcon className="size-4" />}
					</CommandItem>
				))}
			</CommandGroup>
		</Picker>
	);
}

export function PriorityPicker({
	value,
	onChange,
	className,
}: {
	value: number;
	onChange: (priority: number) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const order = [1, 2, 3, 4, 0];
	return (
		<Picker
			label="Set priority"
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Trigger className={className}>
					<PriorityIcon priority={value} />
					<span className={cn("truncate", !value && "text-muted-foreground")}>
						{PRIORITY_META[value]?.label}
					</span>
				</Trigger>
			}
		>
			<CommandGroup>
				{order.map((priority) => (
					<CommandItem
						key={priority}
						value={PRIORITY_META[priority]?.label}
						onSelect={() => {
							onChange(priority);
							setOpen(false);
						}}
					>
						<PriorityIcon priority={priority} />
						<span className="flex-1">{PRIORITY_META[priority]?.label}</span>
						{value === priority && <CheckIcon className="size-4" />}
					</CommandItem>
				))}
			</CommandGroup>
		</Picker>
	);
}

export function TypePicker({
	value,
	onChange,
	className,
}: {
	value: "bug" | "feature";
	onChange: (type: "bug" | "feature") => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const options = [
		{ id: "bug" as const, label: "Bug" },
		{ id: "feature" as const, label: "Feature request" },
	];
	return (
		<Picker
			label="Type"
			searchable={false}
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Trigger className={className}>
					<TypeIcon type={value} />
					<span className="truncate">
						{value === "bug" ? "Bug" : "Feature request"}
					</span>
				</Trigger>
			}
		>
			<CommandGroup>
				{options.map((option) => (
					<CommandItem
						key={option.id}
						value={option.label}
						onSelect={() => {
							onChange(option.id);
							setOpen(false);
						}}
					>
						<TypeIcon type={option.id} />
						<span className="flex-1">{option.label}</span>
						{value === option.id && <CheckIcon className="size-4" />}
					</CommandItem>
				))}
			</CommandGroup>
		</Picker>
	);
}

export function AssigneePicker({
	projectId,
	value,
	onChange,
	className,
}: {
	projectId: string;
	value: AssigneeValue;
	onChange: (assignee: AssigneeValue) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const { data } = useQuery({
		queryKey: ["assignees", projectId],
		queryFn: () => listAssigneesFn({ data: { projectId } }),
		enabled: open,
		staleTime: 60_000,
	});
	const pick = (assignee: AssigneeValue) => {
		onChange(assignee);
		setOpen(false);
	};
	return (
		<Picker
			label="Assign to"
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Trigger className={className}>
					{value ? (
						<>
							<Face
								name={value.name}
								id={value.id}
								kind={value.type}
								size={18}
							/>
							<span className="truncate">{value.name}</span>
						</>
					) : (
						<>
							<span className="size-[18px] rounded-full border border-dashed border-control" />
							<span className="text-muted-foreground">Unassigned</span>
						</>
					)}
				</Trigger>
			}
		>
			<CommandEmpty>No one matches.</CommandEmpty>
			{data && data.agents.length > 0 && (
				<CommandGroup heading="Agents">
					{data.agents.map((agent) => (
						<CommandItem
							key={agent.id}
							value={`agent ${agent.name}`}
							onSelect={() =>
								pick({ type: "agent", id: agent.id, name: agent.name })
							}
						>
							<Face name={agent.name} kind="agent" size={18} />
							<span className="flex-1 truncate">{agent.name}</span>
							{value?.id === agent.id && <CheckIcon className="size-4" />}
						</CommandItem>
					))}
				</CommandGroup>
			)}
			{data && (
				<CommandGroup heading="People">
					{data.members.map((member) => (
						<CommandItem
							key={member.id}
							value={`user ${member.name} ${member.email}`}
							onSelect={() =>
								pick({ type: "user", id: member.id, name: member.name })
							}
						>
							<Face name={member.name} id={member.id} size={18} />
							<span className="flex-1 truncate">
								{member.name}
								{member.id === data.me && (
									<span className="text-muted-foreground"> (you)</span>
								)}
							</span>
							{value?.id === member.id && <CheckIcon className="size-4" />}
						</CommandItem>
					))}
				</CommandGroup>
			)}
			{value && (
				<CommandGroup>
					<CommandItem value="unassign" onSelect={() => pick(null)}>
						<UserRoundXIcon />
						Unassign
					</CommandItem>
				</CommandGroup>
			)}
		</Picker>
	);
}

export function LabelsPicker({
	value,
	onChange,
	className,
}: {
	value: string[];
	onChange: (labels: string[]) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const known = ["ui", "checkout", "payments", "mobile", "performance", "auth"];
	const choices = [...new Set([...value, ...known])];
	const typed = search.trim().toLowerCase();
	const toggle = (label: string) =>
		onChange(
			value.includes(label)
				? value.filter((l) => l !== label)
				: [...value, label],
		);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Trigger className={cn("h-auto min-h-8 flex-wrap py-1.5", className)}>
					{value.length === 0 ? (
						<>
							<TagIcon className="size-3.5 text-muted-foreground" />
							<span className="text-muted-foreground">Add labels</span>
						</>
					) : (
						value.map((label) => <LabelChip key={label}>{label}</LabelChip>)
					)}
				</Trigger>
			</PopoverTrigger>
			<PopoverContent className="w-60 p-0" align="start">
				<Command label="Labels">
					<CommandInput
						placeholder="Find or create a label…"
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList>
						<CommandGroup>
							{choices.map((label) => (
								<CommandItem
									key={label}
									value={label}
									onSelect={() => toggle(label)}
								>
									<span
										className={cn(
											"flex size-4 items-center justify-center rounded-sm border border-control",
											value.includes(label) &&
												"border-primary bg-primary text-primary-foreground",
										)}
									>
										{value.includes(label) && <CheckIcon className="size-3" />}
									</span>
									{label}
								</CommandItem>
							))}
							{typed && !choices.includes(typed) && (
								<CommandItem
									value={`create ${typed}`}
									onSelect={() => {
										toggle(typed);
										setSearch("");
									}}
								>
									<PlusIcon />
									Create “{typed}”
								</CommandItem>
							)}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
