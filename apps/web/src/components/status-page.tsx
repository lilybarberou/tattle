import { Link, useMatch, useRouter } from "@tanstack/react-router";
import { BrandMark } from "#/components/brand";
import { Button } from "#/components/ui/button";
import { useI18n } from "#/i18n/react";

/**
 * True when this replaces a page inside the dashboard: the sidebar and its
 * <main> are still around it. Not when the dashboard layout itself failed.
 */
const useInApp = () => {
	const here = useMatch({ strict: false });
	return here.routeId.startsWith("/_app/");
};

/**
 * What a missing page or a failed load shows instead of the router's bare
 * defaults: a heading, a sentence and a way back.
 */
function StatusPage({
	title,
	text,
	details,
	children,
}: {
	title: string;
	text: string;
	/** Technical detail, folded away like the router's own "Show error". */
	details?: string;
	children?: React.ReactNode;
}) {
	const inApp = useInApp();
	const { m } = useI18n();
	const body = (
		<div className="w-full max-w-md space-y-3 text-center">
			{!inApp && <BrandMark className="mx-auto size-6" />}
			<h1 className="text-xl font-semibold text-balance">{title}</h1>
			<p className="text-pretty text-muted-foreground">{text}</p>
			{details && (
				<details className="text-left text-xs text-muted-foreground">
					<summary className="cursor-pointer text-center">
						{m.app.status.details}
					</summary>
					<pre
						// biome-ignore lint/a11y/noNoninteractiveTabindex: it scrolls when long
						tabIndex={0}
						className="mt-2 max-h-40 overflow-auto rounded-md border bg-muted/50 p-2 font-mono whitespace-pre-wrap break-words"
					>
						{details}
					</pre>
				</details>
			)}
			<div className="flex flex-wrap justify-center gap-2 pt-2">
				{children}
				<Button asChild variant={children ? "outline" : "default"}>
					<Link to="/">{m.app.status.backHome}</Link>
				</Button>
			</div>
		</div>
	);
	if (inApp)
		return (
			<div className="flex min-h-full items-center justify-center px-4 py-16">
				{body}
			</div>
		);
	return (
		<main className="flex min-h-dvh items-center justify-center bg-ground px-4 py-10">
			{body}
		</main>
	);
}

export function NotFoundPage() {
	const { m } = useI18n();
	return (
		<StatusPage
			title={m.app.status.notFoundTitle}
			text={m.app.status.notFoundText}
		/>
	);
}

export function ErrorPage({ error }: { error: unknown }) {
	const router = useRouter();
	const { m } = useI18n();
	const message = error instanceof Error ? error.message : "";
	return (
		<StatusPage
			title={m.app.status.errorTitle}
			text={m.app.status.errorText}
			details={message && message !== m.errors.internal ? message : undefined}
		>
			<Button onClick={() => router.invalidate()}>
				{m.common.actions.retry}
			</Button>
		</StatusPage>
	);
}

/** The status of a server function's failure (see HttpError), if it has one. */
export const errorStatus = (error: unknown): number | undefined => {
	const status = (error as { status?: unknown } | null)?.status;
	return typeof status === "number" ? status : undefined;
};
