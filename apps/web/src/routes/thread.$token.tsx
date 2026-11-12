import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { SendIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "#/components/brand";
import { relativeTime } from "#/components/issue-meta";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";
import {
	getThreadLinkFn,
	markThreadLinkReadFn,
	replyThreadLinkFn,
} from "#/server/fns";
import {
	MAX_MESSAGE_LENGTH,
	REPORTER_STATUS_LABELS,
	type ReporterStatus,
} from "#/shared/issues";

// The conversation about one report, opened from the link in a reply email.
// No account: the signed, expiring token in the address is the access.
export const Route = createFileRoute("/thread/$token")({
	loader: async ({ params }) => {
		try {
			return await getThreadLinkFn({ data: { token: params.token } });
		} catch {
			throw notFound();
		}
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title:
					loaderData && !loaderData.expired
						? `${loaderData.project} · Your report`
						: "Your report",
			},
			{ name: "robots", content: "noindex" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	notFoundComponent: () => (
		<Notice
			title="This link doesn't work"
			text="It may be incomplete: open it again from the email, without changing it."
		/>
	),
	component: ThreadPage,
});

const STATUS_CLASS: Record<ReporterStatus, string> = {
	received: "bg-pill-neutral text-pill-neutral-ink",
	planned: "bg-pill-neutral text-pill-neutral-ink",
	in_progress: "bg-brand-soft text-brand",
	fixed: "bg-pill-positive text-pill-positive-ink",
	wont_fix: "bg-pill-neutral text-pill-neutral-ink",
};

function Notice({ title, text }: { title: string; text: string }) {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-ground px-4 text-center">
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

	// Opening the page reads the team's messages.
	useEffect(() => {
		if (!expired)
			void markThreadLinkReadFn({ data: { token } }).catch(() => undefined);
	}, [expired, token]);

	if (data.expired)
		return (
			<Notice
				title="This link has expired"
				text="Links in our emails work for 30 days. The next reply from the team brings a new one, and the app's feedback button shows your reports too."
			/>
		);
	const { project, thread } = data;

	const send = async () => {
		if (!body.trim() || sending) return;
		setSending(true);
		try {
			await replyThreadLinkFn({ data: { token, body } });
			setBody("");
			toast.success("Sent. The team will read it.");
			await router.invalidate();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Not sent");
		} finally {
			setSending(false);
		}
	};

	return (
		<div className="min-h-dvh bg-ground">
			<main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
				<p className="flex items-center gap-2 font-medium text-muted-foreground">
					<BrandMark className="size-4" />
					{project}
				</p>
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
						{REPORTER_STATUS_LABELS[thread.status]}
					</span>
				</div>
				<p className="mt-1 text-muted-foreground">
					{thread.type === "bug" ? "Bug report" : "Idea"} sent{" "}
					{relativeTime(thread.createdAt)}
				</p>

				<section className="mt-6 rounded-2xl border bg-surface p-5 sm:p-6">
					<ol className="space-y-3">
						<li className="ml-auto max-w-[85%] rounded-lg bg-raised px-3 py-2">
							<p className="text-xs text-muted-foreground">
								<span className="font-medium text-ink">You</span> ·{" "}
								{relativeTime(thread.createdAt)}
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
											? "You"
											: (message.name ?? project)}
									</span>{" "}
									· {relativeTime(message.createdAt)}
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
							Your reply
						</label>
						<Textarea
							id="reply"
							value={body}
							onChange={(e) => setBody(e.target.value)}
							rows={4}
							maxLength={MAX_MESSAGE_LENGTH}
							placeholder="Write to the team…"
						/>
						<Button type="submit" disabled={!body.trim() || sending}>
							<SendIcon className="size-4" />
							Send
						</Button>
					</form>
				</section>
				<p className="mt-6 text-center text-xs text-muted-foreground">
					Anyone with this link can read this conversation and reply. It works
					for 30 days.
				</p>
			</main>
		</div>
	);
}
