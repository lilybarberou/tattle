import { BotIcon, BugIcon, LightbulbIcon } from "lucide-react";
import { cn } from "#/lib/utils";
import type { IssueStatus } from "#/shared/issues";

export const STATUS_META: Record<
	IssueStatus,
	{ label: string; hint: string; className: string }
> = {
	triage: {
		label: "Triage",
		hint: "New, not decided yet",
		className: "text-state-triage",
	},
	backlog: {
		label: "Backlog",
		hint: "Accepted, not planned",
		className: "text-state-open",
	},
	todo: { label: "Todo", hint: "Planned next", className: "text-state-open" },
	in_progress: {
		label: "In progress",
		hint: "Someone is on it",
		className: "text-state-progress",
	},
	in_review: {
		label: "In review",
		hint: "Fix waiting for review",
		className: "text-state-review",
	},
	done: {
		label: "Done",
		hint: "Fixed or shipped",
		className: "text-state-done",
	},
	canceled: {
		label: "Declined",
		hint: "Won't do",
		className: "text-state-closed",
	},
	duplicate: {
		label: "Duplicate",
		hint: "Merged into another issue",
		className: "text-state-closed",
	},
};

/** A 14px glyph with its accessible name as a <title>. */
function Glyph({
	label,
	className,
	children,
}: {
	label: string;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<svg
			width={14}
			height={14}
			viewBox="0 0 14 14"
			fill="none"
			role="img"
			aria-label={label}
			className={className}
		>
			<title>{label}</title>
			{children}
		</svg>
	);
}

/** Workflow states as one family of 14px glyphs, so the state reads at a glance. */
export function StatusIcon({
	status,
	className,
}: {
	status: IssueStatus;
	className?: string;
}) {
	const meta = STATUS_META[status];
	const common = {
		label: meta.label,
		className: cn("shrink-0", meta.className, className),
	};
	switch (status) {
		case "triage":
			return (
				<Glyph {...common}>
					<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
					<circle cx="7" cy="7" r="2.25" fill="currentColor" />
				</Glyph>
			);
		case "backlog":
			return (
				<Glyph {...common}>
					<circle
						cx="7"
						cy="7"
						r="6"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeDasharray="2.2 1.8"
					/>
				</Glyph>
			);
		case "todo":
			return (
				<Glyph {...common}>
					<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
				</Glyph>
			);
		case "in_progress":
			return (
				<Glyph {...common}>
					<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
					<path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
				</Glyph>
			);
		case "in_review":
			return (
				<Glyph {...common}>
					<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
					<path d="M7 3.5a3.5 3.5 0 1 1-3.5 3.5H7z" fill="currentColor" />
				</Glyph>
			);
		case "done":
			return (
				<Glyph {...common}>
					<circle cx="7" cy="7" r="6.75" fill="currentColor" />
					<path
						d="m4.4 7.2 1.8 1.8 3.5-3.6"
						stroke="var(--surface)"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</Glyph>
			);
		case "canceled":
			return (
				<Glyph {...common}>
					<circle cx="7" cy="7" r="6.75" fill="currentColor" />
					<path
						d="m4.9 4.9 4.2 4.2m0-4.2-4.2 4.2"
						stroke="var(--surface)"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</Glyph>
			);
		case "duplicate":
			return (
				<Glyph {...common}>
					<circle cx="7" cy="7" r="6.75" fill="currentColor" />
					<path
						d="M4.5 5.8h5m-5 2.4h5"
						stroke="var(--surface)"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</Glyph>
			);
	}
}

export const PRIORITY_META = [
	{ label: "No priority" },
	{ label: "Urgent" },
	{ label: "High" },
	{ label: "Medium" },
	{ label: "Low" },
] as const;

/** Signal bars for high to low; a filled square for urgent; a dashed line for none. */
export function PriorityIcon({
	priority,
	className,
}: {
	priority: number;
	className?: string;
}) {
	const label = PRIORITY_META[priority]?.label ?? "No priority";
	const common = { label };
	if (priority === 1) {
		return (
			<Glyph {...common} className={cn("shrink-0 text-negative", className)}>
				<rect width="14" height="14" rx="3" fill="currentColor" />
				<path
					d="M7 3.5v4.2"
					stroke="var(--surface)"
					strokeWidth="1.6"
					strokeLinecap="round"
				/>
				<circle cx="7" cy="10.2" r="0.95" fill="var(--surface)" />
			</Glyph>
		);
	}
	if (!priority) {
		return (
			<Glyph
				{...common}
				className={cn("shrink-0 text-muted-foreground", className)}
			>
				<path
					d="M2 7h2.2M5.9 7h2.2M9.8 7H12"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					opacity="0.7"
				/>
			</Glyph>
		);
	}
	const filled = 5 - priority; // high 3, medium 2, low 1
	return (
		<Glyph {...common} className={cn("shrink-0 text-ink", className)}>
			{[0, 1, 2].map((bar) => (
				<rect
					key={bar}
					x={1.5 + bar * 4}
					y={9 - bar * 3}
					width="3"
					height={3.5 + bar * 3}
					rx="1"
					fill="currentColor"
					opacity={bar < filled ? 1 : 0.22}
				/>
			))}
		</Glyph>
	);
}

export function TypeIcon({
	type,
	className,
}: {
	type: "bug" | "feature";
	className?: string;
}) {
	return type === "bug" ? (
		<BugIcon
			aria-label="Bug"
			className={cn("size-3.5 shrink-0 text-muted-foreground", className)}
		/>
	) : (
		<LightbulbIcon
			aria-label="Feature request"
			className={cn("size-3.5 shrink-0 text-muted-foreground", className)}
		/>
	);
}

export function IssueNumber({
	number,
	className,
}: {
	number: number;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"font-mono text-xs text-muted-foreground tabular-nums",
				className,
			)}
		>
			#{number}
		</span>
	);
}

/** A stable hue per name (FNV-1a), so the same person keeps the same tint. */
const hueOf = (key: string) => {
	let hash = 0x811c9dc5;
	for (const char of key) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash % 360;
};

export function LabelChip({ children }: { children: string }) {
	return (
		<span className="inline-flex h-5 flex-none items-center gap-1.5 rounded-full border px-2 text-xs whitespace-nowrap text-muted-foreground">
			<span
				aria-hidden
				className="size-1.5 rounded-full"
				style={{ background: `hsl(${hueOf(children)} 45% 50%)` }}
			/>
			{children}
		</span>
	);
}

/** A person or an agent: a stable initial on a pale tint of their own hue. */
export function Face({
	name,
	id,
	kind = "user",
	size = 20,
	className,
}: {
	name: string;
	id?: string | null;
	kind?: "user" | "agent" | "system";
	size?: number;
	className?: string;
}) {
	if (kind === "agent") {
		return (
			<span
				title={`${name} (agent)`}
				className={cn(
					"inline-flex flex-none items-center justify-center rounded-full bg-brand-soft text-brand",
					className,
				)}
				style={{ width: size, height: size }}
			>
				<BotIcon style={{ width: size * 0.62, height: size * 0.62 }} />
			</span>
		);
	}
	return (
		<span
			title={name}
			className={cn(
				"inline-flex flex-none items-center justify-center rounded-full font-medium text-[#1f2328]",
				className,
			)}
			style={{
				width: size,
				height: size,
				fontSize: Math.max(10, Math.round(size * 0.48)),
				background: `hsl(${hueOf(id ?? name)} 60% 86%)`,
			}}
		>
			{(name.trim()[0] ?? "?").toUpperCase()}
		</span>
	);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function relativeTime(iso: string) {
	const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
	const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
		["year", 31536000],
		["month", 2592000],
		["week", 604800],
		["day", 86400],
		["hour", 3600],
		["minute", 60],
	];
	for (const [unit, size] of units) {
		if (Math.abs(seconds) >= size)
			return rtf.format(Math.round(seconds / size), unit);
	}
	return "just now";
}

/** "9 min", "3 h", "Yesterday", "Nov 3" for dense rows. */
export function shortTime(iso: string) {
	const date = new Date(iso);
	const minutes = Math.round((Date.now() - date.getTime()) / 60000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h`;
	if (hours < 48) return "Yesterday";
	return date.toLocaleDateString("en", { month: "short", day: "numeric" });
}
