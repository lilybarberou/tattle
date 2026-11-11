import { cn } from "#/lib/utils";

/** The title row of every screen: a 22px noun, one grey line of finding, actions on the right. */
export function PageHeader({
	title,
	description,
	actions,
	children,
	className,
}: {
	title: React.ReactNode;
	description?: React.ReactNode;
	actions?: React.ReactNode;
	children?: React.ReactNode;
	className?: string;
}) {
	return (
		<header className={cn("px-6 pt-5", className)}>
			<div className="flex flex-wrap items-start gap-x-4 gap-y-2">
				<div className="min-w-0 flex-1">
					<h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">
						{title}
					</h1>
					{description && (
						<p className="mt-1 text-muted-foreground">{description}</p>
					)}
				</div>
				{actions && <div className="flex items-center gap-2">{actions}</div>}
			</div>
			{children}
		</header>
	);
}
