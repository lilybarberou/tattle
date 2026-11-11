import { createFileRoute, redirect } from "@tanstack/react-router";
import { BotIcon } from "lucide-react";
import { useState } from "react";
import * as z from "zod";
import { AuthShell } from "#/components/auth-shell";
import { Button } from "#/components/ui/button";
import { authClient, followRedirect } from "#/lib/auth-client";
import { getOAuthClientNameFn, getSessionFn } from "#/server/fns";

const SCOPE_TEXT: Record<string, string> = {
	openid: "Know who you are",
	profile: "See your name",
	email: "See your email address",
	offline_access: "Stay connected until you revoke it",
};

// Where an MCP client (Claude Code, Cursor…) lands to be allowed in. The
// signed authorization request rides in the query string.
export const Route = createFileRoute("/consent")({
	validateSearch: z.looseObject({
		client_id: z.string().optional(),
		scope: z.string().optional(),
	}),
	beforeLoad: async ({ location }) => {
		const session = await getSessionFn();
		if (!session) throw redirect({ href: `/login${location.searchStr}` });
		return { user: session.user };
	},
	loaderDeps: ({ search }) => ({ clientId: search.client_id }),
	loader: ({ deps }) =>
		deps.clientId
			? getOAuthClientNameFn({ data: { clientId: deps.clientId } })
			: { name: null, uri: null },
	component: Consent,
});

function Consent() {
	const { scope } = Route.useSearch();
	const client = Route.useLoaderData();
	const { user } = Route.useRouteContext();
	const [pending, setPending] = useState<"allow" | "deny" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const name = client.name || "An MCP client";
	const scopes = (scope ?? "").split(" ").filter(Boolean);

	const answer = async (accept: boolean) => {
		setPending(accept ? "allow" : "deny");
		setError(null);
		const result = await authClient.oauth2.consent({ accept });
		if (result.error) {
			setPending(null);
			setError(result.error.message ?? "Something went wrong");
			return;
		}
		if (!followRedirect(result.data)) setPending(null);
	};

	return (
		<AuthShell
			title={`Allow ${name}?`}
			intro={
				<>
					It will act as{" "}
					<span className="font-medium text-ink">{user.name}</span> (
					{user.email}) through MCP: read issues and reports, triage, comment
					and update them in your projects.
				</>
			}
		>
			<div className="flex items-center gap-3 rounded-lg bg-raised px-4 py-3">
				<span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand">
					<BotIcon className="size-5" />
				</span>
				<div className="min-w-0">
					<p className="truncate font-medium">{name}</p>
					{client.uri && (
						<p className="truncate text-xs text-muted-foreground">
							{client.uri}
						</p>
					)}
				</div>
			</div>
			{scopes.length > 0 && (
				<ul className="space-y-1 text-muted-foreground">
					{scopes.map((s) => (
						<li key={s}>· {SCOPE_TEXT[s] ?? s}</li>
					))}
				</ul>
			)}
			{error && <p className="text-destructive">{error}</p>}
			<div className="flex gap-2">
				<Button
					className="flex-1"
					onClick={() => answer(true)}
					disabled={pending !== null}
				>
					{pending === "allow" ? "Allowing…" : "Allow"}
				</Button>
				<Button
					variant="outline"
					className="flex-1"
					onClick={() => answer(false)}
					disabled={pending !== null}
				>
					Deny
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				You can disconnect it at any time from Agents & API.
			</p>
		</AuthShell>
	);
}
