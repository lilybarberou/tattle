import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import * as z from "zod";
import { useAppActions } from "#/components/app-actions";
import { STATUS_META, StatusIcon } from "#/components/issue-meta";
import { PageHeader } from "#/components/page-header";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { listIssuesFn } from "#/server/fns";

const OPEN = ["triage", "backlog", "todo", "in_progress", "in_review"] as const;

export const Route = createFileRoute("/_app/p/$projectId/requests")({
	validateSearch: z.object({ shipped: z.boolean().optional() }),
	loaderDeps: ({ search }) => ({ shipped: search.shipped ?? false }),
	loader: async ({ params, deps }) => {
		const items = await listIssuesFn({
			data: {
				projectId: params.projectId,
				type: "feature",
				statuses: deps.shipped ? ["done"] : [...OPEN],
			},
		});
		// Demand: people who asked in the widget plus votes on the public page.
		return items
			.map((item) => ({ ...item, demand: item.reportCount + item.voteCount }))
			.sort(
				(a, b) => b.demand - a.demand || b.updatedAt.localeCompare(a.updatedAt),
			);
	},
	component: RequestsPage,
});

function RequestsPage() {
	const requests = Route.useLoaderData();
	const { projectId } = Route.useParams();
	const { shipped } = Route.useSearch();
	const { newIssue } = useAppActions();
	const top = Math.max(1, ...requests.map((r) => r.demand));
	const people = requests.reduce((sum, r) => sum + r.demand, 0);
	const leader = requests[0];

	return (
		<>
			<PageHeader
				title="Feature requests"
				description={
					shipped
						? `${requests.length} shipped.`
						: leader
							? `${people} ${people === 1 ? "request" : "requests"} across ${requests.length} ideas. Most asked: “${leader.title}” (${leader.demand}).`
							: undefined
				}
				actions={
					<Button onClick={() => newIssue({ type: "feature" })}>
						<PlusIcon className="size-4" />
						New request
					</Button>
				}
			>
				<nav aria-label="Views" className="mt-4 flex gap-5 border-b">
					{[
						{ label: "Most requested", shipped: undefined },
						{ label: "Shipped", shipped: true },
					].map((tab) => (
						<Link
							key={tab.label}
							to="/p/$projectId/requests"
							params={{ projectId }}
							search={{ shipped: tab.shipped }}
							className={cn(
								"-mb-px flex h-9 items-center border-b-2 border-transparent text-muted-foreground hover:text-ink",
								Boolean(shipped) === Boolean(tab.shipped) &&
									"border-brand font-medium text-ink",
							)}
						>
							{tab.label}
						</Link>
					))}
				</nav>
			</PageHeader>

			{requests.length === 0 ? (
				<div className="m-6 rounded-lg border border-dashed px-5 py-4 text-muted-foreground">
					{shipped
						? "Nothing shipped yet. Requests you mark Done land here, so you can tell the people who asked."
						: "No open requests. Users send ideas from the widget's “Suggest an idea” tab; similar ideas merged together add up here."}
				</div>
			) : (
				<ol className="max-w-4xl divide-y divide-rule px-6 py-2">
					{requests.map((request, index) => (
						<li key={request.id}>
							<Link
								to="/p/$projectId/issues/$number"
								params={{ projectId, number: String(request.number) }}
								className="-mx-3 grid grid-cols-[28px_minmax(0,1fr)_88px] items-center gap-x-4 rounded-md px-3 py-3 hover:bg-raised sm:grid-cols-[28px_minmax(0,1fr)_120px_88px]"
							>
								<span className="num text-right text-muted-foreground">
									{index + 1}
								</span>
								<span className="min-w-0">
									<span className="block truncate font-medium">
										{request.title}
									</span>
									<span className="mt-2 block h-[3px] rounded-full bg-rule">
										<span
											className={cn(
												"block h-full rounded-full",
												index === 0 && !shipped ? "bg-brand" : "bg-control",
											)}
											style={{
												width: `${(request.demand / top) * 100}%`,
											}}
										/>
									</span>
								</span>
								<span className="hidden items-center gap-1.5 text-muted-foreground sm:flex">
									<StatusIcon status={request.status} />
									{STATUS_META[request.status].label}
								</span>
								<span className="num text-right">
									<span className="font-medium">{request.demand}</span>
									<span className="text-muted-foreground">
										{" "}
										{request.demand === 1 ? "person" : "people"}
									</span>
								</span>
							</Link>
						</li>
					))}
				</ol>
			)}
		</>
	);
}
