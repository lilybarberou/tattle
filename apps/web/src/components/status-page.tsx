import { Link, useMatch, useRouter } from "@tanstack/react-router";
import { BrandMark } from "#/components/brand";
import { Button } from "#/components/ui/button";

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
	children,
}: {
	title: string;
	text: string;
	children?: React.ReactNode;
}) {
	const inApp = useInApp();
	const body = (
		<div className="w-full max-w-md space-y-3 text-center">
			{!inApp && <BrandMark className="mx-auto size-6" />}
			<h1 className="text-xl font-semibold text-balance">{title}</h1>
			<p className="text-pretty text-muted-foreground">{text}</p>
			<div className="flex flex-wrap justify-center gap-2 pt-2">
				{children}
				<Button asChild variant={children ? "outline" : "default"}>
					<Link to="/">Back to Tattle</Link>
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
	return (
		<StatusPage
			title="This page doesn't exist"
			text="The address may be wrong, or what it showed was deleted."
		/>
	);
}

export function ErrorPage({ error }: { error: unknown }) {
	const router = useRouter();
	const message = error instanceof Error ? error.message : "";
	return (
		<StatusPage
			title="This page couldn't load"
			text={
				message && message !== "Internal server error"
					? message
					: "Something went wrong on the server. Try again in a moment."
			}
		>
			<Button onClick={() => router.invalidate()}>Try again</Button>
		</StatusPage>
	);
}

/** The status of a server function's failure (see HttpError), if it has one. */
export const errorStatus = (error: unknown): number | undefined => {
	const status = (error as { status?: unknown } | null)?.status;
	return typeof status === "number" ? status : undefined;
};
