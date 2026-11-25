import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { SendIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "#/components/brand";
import { LanguageSwitcher } from "#/components/language-switcher";
import { RelativeTime } from "#/components/time";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { useI18n } from "#/i18n/react";
import { headMessages } from "#/i18n/route";
import { cn } from "#/lib/utils";
import {
	getThreadLinkFn,
	markThreadLinkReadFn,
	replyThreadLinkFn,
} from "#/server/fns";
import { MAX_MESSAGE_LENGTH, type ReporterStatus } from "#/shared/issues";

// The conversation about one report, opened from the link in a reply email.
// No account: the signed, expiring token in the address is the access.
export const Route = createFileRoute("/thread/$token")({
	staticData: { visitorLocale: true },
	loader: async ({ params }) => {
		try {
			return await getThreadLinkFn({ data: { token: params.token } });
		} catch {
			throw notFound();
		}
	},
	head: ({ loaderData, matches }) => {
		const t = headMessages(matches).publicPages.thread;
		return {
			meta: [
				{
					title:
						loaderData && !loaderData.expired
							? t.pageTitle(loaderData.project)
							: t.title,
				},
				{ name: "robots", content: "noindex" },
				{ name: "referrer", content: "no-referrer" },
			],
		};
	},
	notFoundComponent: LinkBroken,
	component: ThreadPage,
});

const STATUS_CLASS: Record<ReporterStatus, string> = {
	received: "bg-pill-neutral text-pill-neutral-ink",
	planned: "bg-pill-neutral text-pill-neutral-ink",
	in_progress: "bg-brand-soft text-brand",
	fixed: "bg-pill-positive text-pill-positive-ink",
	wont_fix: "bg-pill-neutral text-pill-neutral-ink",
};

function LinkBroken() {
	const { m } = useI18n();
	return (
		<Notice
			title={m.publicPages.linkBroken}
			text={m.publicPages.linkBrokenHelp}
		/>
	);
}

function Notice({ title, text }: { title: string; text: string }) {
	return (
		<main className="relative flex min-h-dvh items-center justify-center bg-ground px-4 text-center">
			<LanguageSwitcher className="absolute top-4 right-4" />
			<div className="max-w-md space-y-2">
				<h1 className="text-xl font-semibold">{title}</h1>
				<p className="text-muted-foreground">{text}</p>
			</div>
		</main>
	);
}

function ThreadPage() {
	const data = Route.useLoaderData();
	const { token } = Route.useParams();
	const router = useRouter();
	const [body, setBody] = useState("");
	const [sending, setSending] = useState(false);
	const expired = data.expired;
	const { m } = useI18n();
	const t = m.publicPages.thread;

	// Opening the page reads the team's messages.
	useEffect(() => {
		if (!expired)
			void markThreadLinkReadFn({ data: { token } }).catch(() => undefined);
	}, [expired, token]);

	if (data.expired) return <Notice title={t.expired} text={t.expiredHelp} />;
	const { project, thread } = data;

	const send = async () => {
		if (!body.trim() || sending) return;
		setSending(true);
		try {
			await replyThreadLinkFn({ data: { token, body } });
			setBody("");
			toast.success(t.sent);
			await router.invalidate();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : m.common.errors.notSent,
			);
		} finally {
			setSending(false);
		}
	};

	return (
		<div className="min-h-dvh bg-ground">
			<main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
				<div className="flex items-center justify-between gap-4">
					<p className="flex items-center gap-2 font-medium text-muted-foreground">
						<BrandMark className="size-4" />
						{project}
					</p>
					<LanguageSwitcher />
				</div>
				<div className="mt-2 flex flex-wrap items-center gap-3">
					<h1 className="min-w-0 flex-1 text-[22px] leading-8 font-semibold tracking-[-0.01em] break-words">
						{thread.title}
					</h1>
					<span
						className={cn(
							"inline-flex h-6 flex-none items-center rounded-full px-2.5 text-xs font-medium",
							STATUS_CLASS[thread.status],
						)}
					>
						{m.common.reporterStatus[thread.status]}
					</span>
				</div>
				<p className="mt-1 text-muted-foreground">
					{thread.type === "bug" ? t.bugSent : t.ideaSent}{" "}
					<RelativeTime iso={thread.createdAt} />
				</p>

				<section className="mt-6 rounded-2xl border bg-surface p-5 sm:p-6">
					<ol className="space-y-3">
						<li className="ml-auto max-w-[85%] rounded-lg bg-raised px-3 py-2">
							<p className="text-xs text-muted-foreground">
								<span className="font-medium text-ink">{t.you}</span> ·{" "}
								<RelativeTime iso={thread.createdAt} />
							</p>
							<p className="mt-0.5 break-words whitespace-pre-wrap">
								{thread.message}
							</p>
						</li>
						{thread.messages.map((message) => (
							<li
								key={message.id}
								className={cn(
									"max-w-[85%] rounded-lg px-3 py-2",
									message.from === "reporter"
										? "ml-auto bg-raised"
										: "bg-brand-soft",
								)}
							>
								<p className="text-xs text-muted-foreground">
									<span className="font-medium text-ink">
										{message.from === "reporter"
											? t.you
											: (message.name ?? project)}
									</span>{" "}
									· <RelativeTime iso={message.createdAt} />
								</p>
								<p className="mt-0.5 break-words whitespace-pre-wrap">
									{message.body}
								</p>
							</li>
						))}
					</ol>

					<form
						className="mt-5 space-y-3"
						onSubmit={(event) => {
							event.preventDefault();
							void send();
						}}
					>
						<label htmlFor="reply" className="sr-only">
							{t.yourReply}
						</label>
						<Textarea
							id="reply"
							value={body}
							onChange={(e) => setBody(e.target.value)}
							rows={4}
							maxLength={MAX_MESSAGE_LENGTH}
							placeholder={t.placeholder}
						/>
						<Button type="submit" disabled={!body.trim() || sending}>
							<SendIcon className="size-4" />
							{t.send}
						</Button>
					</form>
				</section>
				<p className="mt-6 text-center text-xs text-muted-foreground">
					{t.footer}
				</p>
			</main>
		</div>
	);
}
