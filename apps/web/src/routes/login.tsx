import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import * as z from "zod";
import { Brand } from "#/components/brand";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient, followRedirect } from "#/lib/auth-client";
import { getSessionFn, getSignupStateFn } from "#/server/fns";

export const Route = createFileRoute("/login")({
	// An invitation link carries the invited email: /login?email=…
	// Unknown params are kept: an OAuth authorization (an MCP client signing a
	// person in) arrives here with its signed query, which sign-in must carry.
	validateSearch: z.looseObject({ email: z.string().optional() }),
	beforeLoad: async ({ search }) => {
		const oauth = "client_id" in search;
		if (!oauth && (await getSessionFn())) throw redirect({ to: "/" });
	},
	loaderDeps: ({ search }) => ({ email: search.email }),
	loader: ({ deps }) => getSignupStateFn({ data: { email: deps.email } }),
	component: LoginPage,
});

function LoginPage() {
	const signup = Route.useLoaderData();
	const { email: invitedEmail } = Route.useSearch();
	const navigate = useNavigate();
	const canSignUp = signup.allowed;
	const [mode, setMode] = useState<"sign-in" | "sign-up">(
		signup.firstUser || (invitedEmail && canSignUp) ? "sign-up" : "sign-in",
	);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const email = String(form.get("email"));
		const password = String(form.get("password"));
		setPending(true);
		setError(null);
		const result =
			mode === "sign-in"
				? await authClient.signIn.email({ email, password })
				: await authClient.signUp.email({
						email,
						password,
						name: String(form.get("name")),
						// Checked by the server for the first account only.
						...(signup.firstUser
							? { setupCode: String(form.get("setupCode")) }
							: {}),
					} as Parameters<typeof authClient.signUp.email>[0]);
		setPending(false);
		if (result.error) {
			setError(result.error.message ?? "Something went wrong");
			return;
		}
		if (followRedirect(result.data)) return;
		await navigate({ to: "/" });
	};

	const heading =
		mode === "sign-in"
			? "Sign in"
			: signup.firstUser
				? "Create the admin account"
				: "Create your account";
	const intro =
		mode === "sign-up" && signup.firstUser
			? "This is the first account on this server. It owns the workspace; sign-up closes after it, and you invite the others."
			: mode === "sign-up" && invitedEmail
				? `You were invited as ${invitedEmail}.`
				: "Bug reports and feature requests from your users, triaged by your agents.";

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ground px-4 py-10">
			<Brand className="text-base" />
			<div className="w-full max-w-sm space-y-6 rounded-2xl border bg-surface p-7">
				<div className="space-y-1">
					<h1 className="text-xl font-semibold">{heading}</h1>
					<p className="text-muted-foreground">{intro}</p>
				</div>
				<form onSubmit={onSubmit} className="space-y-4">
					{mode === "sign-up" && signup.firstUser && (
						<div className="space-y-1.5">
							<Label htmlFor="setupCode">Setup code</Label>
							<Input
								id="setupCode"
								name="setupCode"
								required
								autoComplete="off"
								spellCheck={false}
								placeholder="XXXX-XXXX-XXXX"
								className="font-mono uppercase"
							/>
							<p className="text-xs text-muted-foreground">
								In the server logs, on the line that starts with{" "}
								<code className="font-mono">[setup]</code>. It proves you run
								this server.
							</p>
						</div>
					)}
					{mode === "sign-up" && (
						<div className="space-y-1.5">
							<Label htmlFor="name">Name</Label>
							<Input id="name" name="name" required autoComplete="name" />
						</div>
					)}
					<div className="space-y-1.5">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							required
							autoComplete="email"
							defaultValue={invitedEmail}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							name="password"
							type="password"
							required
							minLength={
								mode === "sign-up" ? signup.minPasswordLength : undefined
							}
							autoComplete={
								mode === "sign-in" ? "current-password" : "new-password"
							}
						/>
						{mode === "sign-up" && (
							<p className="text-xs text-muted-foreground">
								At least {signup.minPasswordLength} characters.
							</p>
						)}
						{mode === "sign-in" && signup.canResetPassword && (
							<Link
								to="/forgot-password"
								search={{ email: invitedEmail }}
								className="inline-block text-xs text-muted-foreground hover:text-ink"
							>
								Forgot your password?
							</Link>
						)}
					</div>
					{error && <p className="text-destructive">{error}</p>}
					<Button type="submit" className="w-full" disabled={pending}>
						{mode === "sign-in" ? "Sign in" : "Create account"}
					</Button>
				</form>
				{!signup.firstUser && (
					<p className="text-center text-muted-foreground">
						{mode === "sign-up" ? (
							<>
								Already have an account?{" "}
								<button
									type="button"
									className="font-medium text-ink underline underline-offset-4"
									onClick={() => {
										setMode("sign-in");
										setError(null);
									}}
								>
									Sign in
								</button>
							</>
						) : canSignUp ? (
							<>
								No account yet?{" "}
								<button
									type="button"
									className="font-medium text-ink underline underline-offset-4"
									onClick={() => {
										setMode("sign-up");
										setError(null);
									}}
								>
									Create one
								</button>
							</>
						) : (
							"Accounts are created by invitation. Ask a member of your team."
						)}
					</p>
				)}
			</div>
		</main>
	);
}
