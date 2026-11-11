/** One settings row: what it is on the left, the controls on the right. */
export function SettingsSection({
	id,
	title,
	description,
	children,
}: {
	id: string;
	title: string;
	description: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section
			aria-labelledby={id}
			className="grid gap-4 border-t py-8 first:border-t-0 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10"
		>
			<div className="space-y-1">
				<h2 id={id} className="text-base font-semibold">
					{title}
				</h2>
				<div className="text-muted-foreground">{description}</div>
			</div>
			<div className="min-w-0 space-y-4">{children}</div>
		</section>
	);
}
