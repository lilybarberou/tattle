import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import * as z from "zod/mini";
import { authErrorMessage } from "#/components/auth-shell";
import { Brand } from "#/components/brand";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/i18n/react";
import { authClient, followRedirect } from "#/lib/auth-client";
import {
	acceptInvitationFn,
	getSessionFn,
	getSignupStateFn,
} from "#/server/fns";

export const Route = createFileRoute("/login")({
	// An invitation link carries the invited email and a signed token:
	// /login?email=…&invite=…
	// Unknown params are kept: an OAuth authorization (an MCP client signing a
	// person in) arrives here with its signed query, which sign-in must carry.
	validateSearch: z.looseObject({
		email: z.optional(z.string()),
		invite: z.optional(z.string()),
	}),
	beforeLoad: async ({ search }) => {
		const oauth = "client_id" in search;
		const session = oauth ? null : await getSessionFn();
		if (!session) return { signedInAs: null };
		// Already signed in: an invitation link still makes them join.
		if (search.invite && !(await joins(search.invite))) {
			// Another account, or a link no longer valid: say so, rather than
			// open the dashboard as if they had joined.
			return { signedInAs: session.user.email };
		}
		throw redirect({ to: "/" });
	},
	loaderDeps: ({ search }) => ({ email: search.email, invite: search.invite }),
	// Never shown from the cache: whether this is the first account changes
	// once it is created. A cached "no account yet" made the page open on
	// "Create your account" after the admin signed out, in the same tab.
	gcTime: 0,
	loader: ({ deps }) =>
		getSignupStateFn({ data: { email: deps.email, invite: deps.invite } }),
	component: LoginPage,
});

/** Whether the signed-in person joined the organization of this invitation. */
const joins = (invite: string) =>
	acceptInvitationFn({ data: { invite } }).then(
		(result) => result.joined,
		() => false,
	);

function LoginPage() {
	const signup = Route.useLoaderData();
	const { email: invitedEmail, invite } = Route.useSearch();
	const { signedInAs } = Route.useRouteContext();
	const [wrongAccount, setWrongAccount] = useState(signedInAs);
	const navigate = useNavigate();
	const { m } = useI18n();
	const t = m.auth.login;
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
						// Checked by the server: lets an invited person create their account.
						...(invite ? { invite } : {}),
						// Checked by the server for the first account only.
						...(signup.firstUser
							? { setupCode: String(form.get("setupCode")) }
							: {}),
					} as Parameters<typeof authClient.signUp.email>[0]);
		setPending(false);
		if (result.error) {
			setError(authErrorMessage(m, result.error, m.common.errors.generic));
			return;
		}
		// Joins the organization of the invitation link, when it was sent to
		// this account's email.
		if (invite && !(await joins(invite))) {
			setWrongAccount(email);
			return;
		}
		if (followRedirect(result.data)) return;
		await navigate({ to: "/" });
	};

	const heading =
		mode === "sign-in"
			? t.signIn
			: signup.firstUser
				? t.createAdmin
				: t.createYours;
	const intro =
		mode === "sign-up" && signup.firstUser
			? t.firstAccountIntro
			: mode === "sign-up" && invitedEmail
				? t.invitedAs(invitedEmail)
				: m.common.tagline;

	if (wrongAccount) {
		return (
			<main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ground px-4 py-10">
				<Brand className="text-base" />
				<div className="w-full max-w-sm space-y-6 rounded-2xl border bg-surface p-7">
					<div className="space-y-2">
						<h1 className="text-xl font-semibold">{t.wrongAccountTitle}</h1>
						<p className="text-muted-foreground">
							{t.signedInAs}{" "}
							<span className="font-medium text-ink">{wrongAccount}</span>.
							{invitedEmail ? t.sentToOther(invitedEmail) : t.sentToAnother}
						</p>
						<p className="text-muted-foreground">
							{t.wrongAccountHelp(wrongAccount)}
						</p>
					</div>
					<div className="flex flex-col gap-2">
						<Button
							onClick={async () => {
								await authClient.signOut();
								setWrongAccount(null);
							}}
						>
							{t.signOut}
						</Button>
						<Button variant="outline" asChild>
							<Link to="/">{t.goToDashboard}</Link>
						</Button>
					</div>
				</div>
			</main>
		);
	}

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
							<Label htmlFor="setupCode">{t.setupCode}</Label>
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
								{t.setupCodeHelpBefore}{" "}
								<code className="font-mono">[setup]</code>
								{t.setupCodeHelpAfter}
							</p>
						</div>
					)}
					{mode === "sign-up" && (
						<div className="space-y-1.5">
							<Label htmlFor="name">{t.name}</Label>
							<Input id="name" name="name" required autoComplete="name" />
						</div>
					)}
					<div className="space-y-1.5">
						<Label htmlFor="email">{t.email}</Label>
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
						<Label htmlFor="password">{t.password}</Label>
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
								{t.minLength(signup.minPasswordLength)}
							</p>
						)}
						{mode === "sign-in" && signup.canResetPassword && (
							<Link
								to="/forgot-password"
								search={{ email: invitedEmail }}
								className="inline-block text-xs text-muted-foreground hover:text-ink"
							>
								{t.forgot}
							</Link>
						)}
					</div>
					{error && <p className="text-destructive">{error}</p>}
					<Button type="submit" className="w-full" disabled={pending}>
						{mode === "sign-in" ? t.signIn : t.createAccount}
					</Button>
				</form>
				{!signup.firstUser && (
					<p className="text-center text-muted-foreground">
						{mode === "sign-up" ? (
							<>
								{t.haveAccount}{" "}
								<button
									type="button"
									className="font-medium text-ink underline underline-offset-4"
									onClick={() => {
										setMode("sign-in");
										setError(null);
									}}
								>
									{t.signIn}
								</button>
							</>
						) : canSignUp ? (
							<>
								{t.noAccount}{" "}
								<button
									type="button"
									className="font-medium text-ink underline underline-offset-4"
									onClick={() => {
										setMode("sign-up");
										setError(null);
									}}
								>
									{t.createOne}
								</button>
							</>
						) : (
							t.invitationOnly
						)}
					</p>
				)}
			</div>
		</main>
	);
}
