import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "#/components/brand";
import { Button } from "#/components/ui/button";
import { getUnsubscribeFn, unsubscribeFn } from "#/server/fns";

// The "Unsubscribe" and "Stop emails about this report" links of our emails.
// No account: the signed token in the address is the access. Opening the page
// changes nothing (link checkers open links too); the button does.
export const Route = createFileRoute("/unsubscribe/$token")({
	loader: async ({ params }) => {
		try {
			return await getUnsubscribeFn({ data: { token: params.token } });
		} catch {
			throw notFound();
		}
	},
	head: () => ({
		meta: [
			{ title: "Unsubscribe" },
			{ name: "robots", content: "noindex" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	notFoundComponent: () => (
		<Shell>
			<h1 className="text-xl font-semibold">This link doesn't work</h1>
			<p className="text-muted-foreground">
				It may be incomplete: open it again from the email, without changing it.
			</p>
		</Shell>
	),
	component: UnsubscribePage,
});

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-ground px-4">
			<div className="w-full max-w-md space-y-3 rounded-2xl border bg-surface p-6">
				<BrandMark className="size-5" />
				{children}
			</div>
		</main>
	);
}

function UnsubscribePage() {
	const target = Route.useLoaderData();
	const { token } = Route.useParams();
	const [done, setDone] = useState(false);
	const [busy, setBusy] = useState(false);

	const stop = async () => {
		setBusy(true);
		try {
			await unsubscribeFn({ data: { token } });
			setDone(true);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Not saved");
		} finally {
			setBusy(false);
		}
	};

	if (target.kind === "report")
		return (
			<Shell>
				<h1 className="text-xl font-semibold">
					{done ? "You won't get emails about this report" : "Stop emails?"}
				</h1>
				<p className="text-muted-foreground">
					{done
						? `${target.project} won't email you about it anymore. Replies still show in the app's feedback button.`
						: `About your report to ${target.project}: “${target.title}”. You won't get the team's replies or the notice when it's fixed by email.`}
				</p>
				{!done && (
					<Button onClick={stop} disabled={busy}>
						Stop emails about this report
					</Button>
				)}
			</Shell>
		);

	return (
		<Shell>
			<h1 className="text-xl font-semibold">
				{done ? "Unsubscribed" : "Unsubscribe?"}
			</h1>
			<p className="text-muted-foreground">
				{done
					? `You won't get “${target.label}” emails anymore.`
					: `You'll stop getting “${target.label}” emails from Tattle.`}{" "}
				Turn them back on, or others off, in your notification settings.
			</p>
			<div className="flex flex-wrap gap-2">
				{!done && (
					<Button onClick={stop} disabled={busy}>
						Unsubscribe
					</Button>
				)}
				<Button variant="outline" asChild>
					<Link to="/notifications">Notification settings</Link>
				</Button>
			</div>
		</Shell>
	);
}
