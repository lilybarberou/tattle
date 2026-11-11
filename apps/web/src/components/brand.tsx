import { cn } from "#/lib/utils";

/** The product mark: a speech bubble whose tail is a pin, drawn in the accent. */
export function BrandMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 20 20"
			aria-hidden="true"
			className={cn("size-5 shrink-0 text-brand", className)}
		>
			<path
				d="M4 2.5h12A2.5 2.5 0 0 1 18.5 5v7.5A2.5 2.5 0 0 1 16 15h-6.2L6 18.2V15H4a2.5 2.5 0 0 1-2.5-2.5V5A2.5 2.5 0 0 1 4 2.5Z"
				fill="currentColor"
			/>
			<circle cx="10" cy="8.75" r="2.4" fill="var(--surface)" />
		</svg>
	);
}

export function Brand({ className }: { className?: string }) {
	return (
		<span className={cn("flex items-center gap-2 font-semibold", className)}>
			<BrandMark />
			Tattle
		</span>
	);
}
