import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

export function CodeBlock({ code, label }: { code: string; label?: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="relative rounded-lg border bg-muted/50">
			{label && (
				<p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
					{label}
				</p>
			)}
			{/* Focusable: a long line scrolls sideways, with the arrow keys too. */}
			<pre
				// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling block must be reachable from the keyboard
				tabIndex={0}
				className="overflow-x-auto rounded-lg p-3 pr-12 font-mono text-xs leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2"
			>
				{code}
			</pre>
			<button
				type="button"
				aria-label={label ? `Copy: ${label}` : "Copy"}
				onClick={async () => {
					await navigator.clipboard.writeText(code);
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				}}
				className="absolute right-2 bottom-2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				{copied ? (
					<CheckIcon className="size-4" />
				) : (
					<CopyIcon className="size-4" />
				)}
			</button>
			{/* Screen readers hear that the copy worked; the check mark is visual. */}
			<span role="status" className="sr-only">
				{copied ? "Copied" : ""}
			</span>
		</div>
	);
}
