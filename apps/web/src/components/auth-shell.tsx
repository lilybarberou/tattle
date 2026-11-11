import { Brand } from "./brand";

/** The frame of the signed-out pages: the mark above one white card. */
export function AuthShell({
	title,
	intro,
	children,
}: {
	title: string;
	intro?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ground px-4 py-10">
			<Brand className="text-base" />
			<div className="w-full max-w-sm space-y-6 rounded-2xl border bg-surface p-7">
				<div className="space-y-1">
					<h1 className="text-xl font-semibold">{title}</h1>
					{intro && <p className="text-muted-foreground">{intro}</p>}
				</div>
				{children}
			</div>
		</main>
	);
}
