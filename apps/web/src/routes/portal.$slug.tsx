import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { ChevronUpIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";
import { BrandMark } from "#/components/brand";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { useI18n } from "#/i18n/react";
import { headMessages } from "#/i18n/route";
import { lenient } from "#/lib/search-params";
import { cn } from "#/lib/utils";
import {
	getPortalFn,
	portalNotifyFn,
	portalSuggestFn,
	portalVoteFn,
} from "#/server/fns";
import type { PortalRequest } from "#/server/Portal";

// The public feature-request page of a project, at /portal/<slug>. No sign-in:
// a visitor is a random id in a cookie, and may leave an email to hear when an
// idea ships.
export const Route = createFileRoute("/portal/$slug")({
	validateSearch: z.object({ shipped: lenient(z.boolean()) }),
	staticData: { visitorLocale: true },
	loader: async ({ params }) => {
		try {
			return await getPortalFn({ data: { slug: params.slug } });
		} catch {
			throw notFound();
		}
	},
	head: ({ loaderData, matches }) => {
		const t = headMessages(matches).publicPages.portal;
		return {
			meta: [
				{
					title: loaderData ? t.pageTitle(loaderData.project.name) : t.title,
				},
			],
		};
	},
	notFoundComponent: NotPublished,
	component: PortalPage,
});

function NotPublished() {
	const { m } = useI18n();
	return (
		<main className="flex min-h-dvh items-center justify-center bg-ground px-4 text-center">
			<div className="space-y-2">
				<h1 className="text-xl font-semibold">
					{m.publicPages.portal.notPublished}
				</h1>
				<p className="text-muted-foreground">
					{m.publicPages.portal.notPublishedHelp}
				</p>
			</div>
		</main>
	);
}

const STATUS_CLASS: Record<PortalRequest["status"], string> = {
	backlog: "bg-pill-neutral text-pill-neutral-ink",
	todo: "bg-pill-neutral text-pill-neutral-ink",
	in_progress: "bg-brand-soft text-brand",
	in_review: "bg-brand-soft text-brand",
	done: "bg-pill-positive text-pill-positive-ink",
};

function RequestRow({
	request,
	slug,
	onVoted,
}: {
	request: PortalRequest;
	slug: string;
	onVoted: (number: number, voted: boolean) => void;
}) {
	const [voted, setVoted] = useState(request.voted);
	const [demand, setDemand] = useState(request.demand);
	const [pending, setPending] = useState(false);
	const shipped = request.status === "done";
	const { m } = useI18n();
	const t = m.publicPages.portal;

	const vote = async () => {
		setPending(true);
		// Optimistic: the count moves at once, and is corrected by the server.
		setVoted(!voted);
		setDemand(demand + (voted ? -1 : 1));
		try {
			const result = await portalVoteFn({
				data: { slug, number: request.number },
			});
			setVoted(result.voted);
			setDemand(result.demand);
			onVoted(request.number, result.voted);
		} catch (error) {
			setVoted(voted);
			setDemand(demand);
			toast.error(error instanceof Error ? error.message : t.voteNotSaved);
		} finally {
			setPending(false);
		}
	};

	return (
		<li className="flex items-center gap-4 py-3">
			<button
				type="button"
				onClick={vote}
				disabled={pending || shipped}
				aria-pressed={voted}
				className={cn(
					"flex h-14 w-12 flex-none flex-col items-center justify-center rounded-lg border text-sm transition-colors",
					voted
						? "border-brand bg-brand-soft text-brand"
						: "border-border bg-surface hover:border-control hover:bg-raised",
					shipped && "cursor-default opacity-70",
				)}
			>
				<ChevronUpIcon className="size-4" aria-hidden />
				{/* The name includes the visible count, so "click 13" works too.
				    It stays the same when voted: aria-pressed tells that. */}
				<span className="sr-only">{t.voteLabel}</span>
				<span className="num font-semibold">{demand}</span>
				<span className="sr-only">{t.votes(demand)}</span>
			</button>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-pretty">{request.title}</p>
			</div>
			<span
				className={cn(
					"inline-flex h-6 flex-none items-center rounded-full px-2.5 text-xs font-medium",
					STATUS_CLASS[request.status],
				)}
			>
				{t.status[request.status]}
			</span>
		</li>
	);
}

function PortalPage() {
	const { project, requests } = Route.useLoaderData();
	const { slug } = Route.useParams();
	const { shipped } = Route.useSearch();
	const router = useRouter();
	const [suggesting, setSuggesting] = useState(false);
	const [justVoted, setJustVoted] = useState<number | null>(null);
	const [notifyEmail, setNotifyEmail] = useState("");
	const [sending, setSending] = useState(false);
	const { m } = useI18n();
	const t = m.publicPages.portal;

	const open = requests.filter((r) => r.status !== "done");
	const done = requests.filter((r) => r.status === "done");
	const shown = shipped ? done : open;
	const votedRequest = requests.find((r) => r.number === justVoted);

	return (
		<div className="min-h-dvh bg-ground">
			<main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
				<header className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<p className="flex items-center gap-2 font-medium text-muted-foreground">
							<BrandMark className="size-4" />
							{project.name}
						</p>
						<h1 className="mt-2 text-[28px] leading-9 font-semibold tracking-[-0.01em]">
							{t.title}
						</h1>
						<p className="mt-1 text-muted-foreground">{t.intro}</p>
					</div>
					<Button onClick={() => setSuggesting(true)}>
						<PlusIcon className="size-4" />
						{t.suggest}
					</Button>
				</header>

				<section className="mt-8 rounded-2xl border bg-surface px-5 pt-2 pb-3 sm:px-6">
					<nav aria-label={t.views} className="flex gap-5 border-b">
						{[
							{ label: t.open, count: open.length, value: undefined },
							{ label: t.shipped, count: done.length, value: true },
						].map((tab) => (
							<Link
								key={tab.label}
								to="/portal/$slug"
								params={{ slug }}
								search={{ shipped: tab.value }}
								className={cn(
									"-mb-px flex h-11 items-center gap-1.5 border-b-2 border-transparent text-muted-foreground hover:text-ink",
									Boolean(shipped) === Boolean(tab.value) &&
										"border-brand font-medium text-ink",
								)}
							>
								{tab.label}
								<span className="num text-xs">{tab.count}</span>
							</Link>
						))}
					</nav>

					{votedRequest && !shipped && (
						<form
							className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-raised px-3 py-2.5"
							onSubmit={async (e) => {
								e.preventDefault();
								setSending(true);
								try {
									await portalNotifyFn({
										data: {
											slug,
											number: votedRequest.number,
											email: notifyEmail,
										},
									});
									toast.success(t.emailWhenShips);
									setJustVoted(null);
								} catch (error) {
									toast.error(
										error instanceof Error
											? error.message
											: m.common.errors.notSaved,
									);
								} finally {
									setSending(false);
								}
							}}
						>
							<label htmlFor="notify-email" className="min-w-0 flex-1 basis-56">
								{t.notifyQuestion(votedRequest.title)}
							</label>
							<Input
								id="notify-email"
								type="email"
								required
								value={notifyEmail}
								onChange={(e) => setNotifyEmail(e.target.value)}
								placeholder={t.emailPlaceholder}
								className="w-56 bg-surface"
							/>
							<Button type="submit" variant="outline" disabled={sending}>
								{t.notifyMe}
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setJustVoted(null)}
							>
								{t.noThanks}
							</Button>
						</form>
					)}

					{shown.length === 0 ? (
						<p className="py-10 text-center text-muted-foreground">
							{shipped ? t.nothingShipped : t.noIdeas}
						</p>
					) : (
						<ul className="divide-y divide-rule">
							{shown.map((request) => (
								<RequestRow
									key={request.number}
									request={request}
									slug={slug}
									onVoted={(number, voted) =>
										setJustVoted(voted ? number : null)
									}
								/>
							))}
						</ul>
					)}
				</section>
				<p className="mt-6 text-center text-xs text-muted-foreground">
					{t.privacy}
				</p>
			</main>

			<Dialog open={suggesting} onOpenChange={setSuggesting}>
				<DialogContent className="sm:max-w-lg">
					<form
						className="space-y-4"
						onSubmit={async (e) => {
							e.preventDefault();
							const form = new FormData(e.currentTarget);
							setSending(true);
							try {
								await portalSuggestFn({
									data: {
										slug,
										title: String(form.get("title")),
										description: String(form.get("description") ?? ""),
										email: String(form.get("email") ?? ""),
									},
								});
								setSuggesting(false);
								toast.success(t.thanks);
								await router.invalidate();
							} catch (error) {
								toast.error(
									error instanceof Error
										? error.message
										: m.common.errors.notSent,
								);
							} finally {
								setSending(false);
							}
						}}
					>
						<DialogHeader>
							<DialogTitle>{t.suggest}</DialogTitle>
							<DialogDescription>{t.suggestIntro}</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							<Label htmlFor="idea-title">{t.ideaTitle}</Label>
							<Input
								id="idea-title"
								name="title"
								required
								minLength={4}
								maxLength={140}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="idea-description">{t.ideaDescription}</Label>
							<Textarea
								id="idea-description"
								name="description"
								rows={4}
								maxLength={4000}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="idea-email">{t.ideaEmail}</Label>
							<Input
								id="idea-email"
								name="email"
								type="email"
								placeholder={t.ideaEmailPlaceholder}
							/>
						</div>
						<Button type="submit" className="w-full" disabled={sending}>
							{t.send}
						</Button>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
