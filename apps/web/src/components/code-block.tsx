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
			<pre className="overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed">
				{code}
			</pre>
			<button
				type="button"
				aria-label="Copy"
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
		</div>
	);
}
