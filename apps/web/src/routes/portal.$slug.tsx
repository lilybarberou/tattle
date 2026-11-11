import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { ChevronUpIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as z from "zod";
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
	validateSearch: z.object({ shipped: z.boolean().optional() }),
	loader: async ({ params }) => {
		try {
			return await getPortalFn({ data: { slug: params.slug } });
		} catch {
			throw notFound();
		}
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `${loaderData.project.name} · Feature requests`
					: "Feature requests",
			},
		],
	}),
	notFoundComponent: () => (
		<main className="flex min-h-dvh items-center justify-center bg-ground px-4 text-center">
			<div className="space-y-2">
				<h1 className="text-xl font-semibold">This page isn't published</h1>
				<p className="text-muted-foreground">
					The address may be wrong, or the team turned this page off.
				</p>
			</div>
		</main>
	),
	component: PortalPage,
});

const STATUS: Record<
	PortalRequest["status"],
	{ label: string; className: string }
> = {
	backlog: {
		label: "Considering",
		className: "bg-pill-neutral text-pill-neutral-ink",
	},
	todo: {
		label: "Planned",
		className: "bg-pill-neutral text-pill-neutral-ink",
	},
	in_progress: { label: "In progress", className: "bg-brand-soft text-brand" },
	in_review: { label: "In progress", className: "bg-brand-soft text-brand" },
	done: {
		label: "Shipped",
		className: "bg-pill-positive text-pill-positive-ink",
	},
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
			toast.error(
				error instanceof Error ? error.message : "Your vote wasn't saved",
			);
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
				aria-label={voted ? `Remove your vote (${demand})` : `Vote (${demand})`}
				className={cn(
					"flex h-14 w-12 flex-none flex-col items-center justify-center rounded-lg border text-sm transition-colors",
					voted
						? "border-brand bg-brand-soft text-brand"
						: "border-border bg-surface hover:border-control hover:bg-raised",
					shipped && "cursor-default opacity-70",
				)}
			>
				<ChevronUpIcon className="size-4" />
				<span className="num font-semibold">{demand}</span>
			</button>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-pretty">{request.title}</p>
			</div>
			<span
				className={cn(
					"inline-flex h-6 flex-none items-center rounded-full px-2.5 text-xs font-medium",
					STATUS[request.status].className,
				)}
			>
				{STATUS[request.status].label}
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
							Feature requests
						</h1>
						<p className="mt-1 text-muted-foreground">
							Vote for what you want next, or suggest something new. We read
							every idea.
						</p>
					</div>
					<Button onClick={() => setSuggesting(true)}>
						<PlusIcon className="size-4" />
						Suggest an idea
					</Button>
				</header>

				<section className="mt-8 rounded-2xl border bg-surface px-5 pt-2 pb-3 sm:px-6">
					<nav aria-label="Views" className="flex gap-5 border-b">
						{[
							{ label: "Open", count: open.length, value: undefined },
							{ label: "Shipped", count: done.length, value: true },
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
									toast.success("We'll email you when it ships");
									setJustVoted(null);
								} catch (error) {
									toast.error(
										error instanceof Error ? error.message : "Not saved",
									);
								} finally {
									setSending(false);
								}
							}}
						>
							<label htmlFor="notify-email" className="min-w-0 flex-1 basis-56">
								Get an email when “{votedRequest.title}” ships?
							</label>
							<Input
								id="notify-email"
								type="email"
								required
								value={notifyEmail}
								onChange={(e) => setNotifyEmail(e.target.value)}
								placeholder="you@company.com"
								className="w-56 bg-surface"
							/>
							<Button type="submit" variant="outline" disabled={sending}>
								Notify me
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setJustVoted(null)}
							>
								No thanks
							</Button>
						</form>
					)}

					{shown.length === 0 ? (
						<p className="py-10 text-center text-muted-foreground">
							{shipped
								? "Nothing shipped from this list yet."
								: "No ideas yet. Be the first to suggest one."}
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
					Your votes are remembered in this browser. We only use your email to
					tell you when an idea ships.
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
								toast.success("Thanks! The team will review your idea.");
								await router.invalidate();
							} catch (error) {
								toast.error(
									error instanceof Error ? error.message : "Not sent",
								);
							} finally {
								setSending(false);
							}
						}}
					>
						<DialogHeader>
							<DialogTitle>Suggest an idea</DialogTitle>
							<DialogDescription>
								The team reviews new ideas before they appear on this page.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							<Label htmlFor="idea-title">Your idea in one line</Label>
							<Input
								id="idea-title"
								name="title"
								required
								minLength={4}
								maxLength={140}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="idea-description">
								What would it help you do?
							</Label>
							<Textarea
								id="idea-description"
								name="description"
								rows={4}
								maxLength={4000}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="idea-email">Email (optional)</Label>
							<Input
								id="idea-email"
								name="email"
								type="email"
								placeholder="To hear when it ships"
							/>
						</div>
						<Button type="submit" className="w-full" disabled={sending}>
							Send the idea
						</Button>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
