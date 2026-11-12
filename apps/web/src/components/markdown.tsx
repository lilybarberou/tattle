import { ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "#/lib/utils";

/*
 * Issue descriptions and comments, written by people and by agents that read
 * untrusted reports. What may come out of them: no raw HTML (react-markdown
 * shows it as text), links only to http(s) and mailto, and no image loaded
 * from anywhere (an image is shown as a link, so no tracking pixel fires).
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** The URL when it is safe to link to, "" otherwise (javascript:, data:, relative paths…). */
export const safeUrl = (value: string) => {
	const url = value.trim();
	// Same-page anchors, such as GFM footnotes.
	if (/^#[\w-]*$/.test(url)) return url;
	try {
		const parsed = new URL(url);
		return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : "";
	} catch {
		return "";
	}
};

const external = { target: "_blank", rel: "noopener noreferrer nofollow" };

const components: Components = {
	a: ({ node: _node, href, children, ...props }) => {
		if (!href) return <span>{children}</span>;
		if (href.startsWith("#"))
			return (
				<a href={href} {...props}>
					{children}
				</a>
			);
		return (
			<a
				href={href}
				{...props}
				{...(href.startsWith("mailto:") ? { rel: "nofollow" } : external)}
			>
				{children}
			</a>
		);
	},
	img: ({ src, alt }) => {
		const label = alt?.trim() || "Image";
		if (!src) return <span>{label}</span>;
		return (
			<a href={src} {...external} className="markdown-image" title={src}>
				<ImageIcon aria-hidden className="size-[1em]" />
				{label}
			</a>
		);
	},
	table: ({ node: _node, ...props }) => (
		<div className="markdown-table">
			<table {...props} />
		</div>
	),
};

export function Markdown({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	return (
		<div className={cn("markdown", className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				urlTransform={safeUrl}
				components={components}
			>
				{children}
			</ReactMarkdown>
		</div>
	);
}

/**
 * A textarea with a Preview tab. The textarea props go to the textarea; the
 * preview takes its place with `previewClassName`.
 */
export function MarkdownInput({
	value,
	className,
	headerClassName,
	previewClassName,
	...textarea
}: Omit<React.ComponentProps<"textarea">, "value"> & {
	value: string;
	headerClassName?: string;
	previewClassName?: string;
}) {
	const [preview, setPreview] = useState(false);
	const ref = useRef<HTMLTextAreaElement>(null);
	// Once the text is sent or the form reset, the next one starts in Write.
	useEffect(() => {
		if (!value) setPreview(false);
	}, [value]);
	const tab = (active: boolean) =>
		cn(
			"h-6 rounded-md px-2 text-xs font-medium transition-colors",
			active
				? "bg-active text-ink"
				: "text-muted-foreground hover:bg-raised hover:text-ink",
		);
	return (
		<div>
			<div className={cn("flex items-center gap-1", headerClassName)}>
				<button
					type="button"
					aria-pressed={!preview}
					className={tab(!preview)}
					onClick={() => {
						setPreview(false);
						requestAnimationFrame(() => ref.current?.focus());
					}}
				>
					Write
				</button>
				<button
					type="button"
					aria-pressed={preview}
					className={tab(preview)}
					onClick={() => setPreview(true)}
				>
					Preview
				</button>
				<a
					href="https://github.github.com/gfm/"
					{...external}
					className="ml-auto text-xs text-muted-foreground hover:text-ink"
				>
					Markdown supported
				</a>
			</div>
			{preview ? (
				<div className={previewClassName}>
					{value.trim() ? (
						<Markdown>{value}</Markdown>
					) : (
						<p className="text-muted-foreground">Nothing to preview.</p>
					)}
				</div>
			) : (
				<textarea ref={ref} value={value} className={className} {...textarea} />
			)}
		</div>
	);
}
