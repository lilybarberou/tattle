import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "#/components/brand";
import { Button } from "#/components/ui/button";
import { useI18n } from "#/i18n/react";
import { headMessages } from "#/i18n/route";
import { getUnsubscribeFn, unsubscribeFn } from "#/server/fns";

// The "Unsubscribe" and "Stop emails about this report" links of our emails.
// No account: the signed token in the address is the access. Opening the page
// changes nothing (link checkers open links too); the button does.
export const Route = createFileRoute("/unsubscribe/$token")({
	staticData: { visitorLocale: true },
	loader: async ({ params }) => {
		try {
			return await getUnsubscribeFn({ data: { token: params.token } });
		} catch {
			throw notFound();
		}
	},
	head: ({ matches }) => ({
		meta: [
			{
				title: headMessages(matches, "visitor").publicPages.unsubscribe
					.pageTitle,
			},
			{ name: "robots", content: "noindex" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	notFoundComponent: LinkBroken,
	component: UnsubscribePage,
});

function LinkBroken() {
	const { m } = useI18n();
	return (
		<Shell>
			<h1 className="text-xl font-semibold">{m.publicPages.linkBroken}</h1>
			<p className="text-muted-foreground">{m.publicPages.linkBrokenHelp}</p>
		</Shell>
	);
}

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
	const { m } = useI18n();
	const t = m.publicPages.unsubscribe;

	const stop = async () => {
		setBusy(true);
		try {
			await unsubscribeFn({ data: { token } });
			setDone(true);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : m.common.errors.notSaved,
			);
		} finally {
			setBusy(false);
		}
	};

	if (target.kind === "report")
		return (
			<Shell>
				<h1 className="text-xl font-semibold">
					{done ? t.reportDone : t.reportAsk}
				</h1>
				<p className="text-muted-foreground">
					{done
						? t.reportDoneText(target.project)
						: t.reportAskText(target.project, target.title)}
				</p>
				{!done && (
					<Button onClick={stop} disabled={busy}>
						{t.stopReport}
					</Button>
				)}
			</Shell>
		);

	const label = m.common.notificationType[target.type].label;
	return (
		<Shell>
			<h1 className="text-xl font-semibold">{done ? t.done : t.ask}</h1>
			<p className="text-muted-foreground">
				{done ? t.doneText(label) : t.askText(label)} {t.turnBackOn}
			</p>
			<div className="flex flex-wrap gap-2">
				{!done && (
					<Button onClick={stop} disabled={busy}>
						{t.unsubscribe}
					</Button>
				)}
				<Button variant="outline" asChild>
					<Link to="/notifications">{t.settings}</Link>
				</Button>
			</div>
		</Shell>
	);
}
