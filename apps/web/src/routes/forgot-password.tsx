import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import * as z from "zod/mini";
import { AuthShell, authErrorMessage } from "#/components/auth-shell";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/i18n/react";
import { authClient } from "#/lib/auth-client";
import { lenient } from "#/lib/search-params";

export const Route = createFileRoute("/forgot-password")({
	validateSearch: z.object({ email: lenient(z.string()) }),
	component: ForgotPassword,
});

function ForgotPassword() {
	const { email } = Route.useSearch();
	const { m } = useI18n();
	const t = m.auth.forgot;
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	if (sentTo) {
		return (
			<AuthShell title={t.checkInbox} intro={t.sent(sentTo)}>
				<Link
					to="/login"
					className="block text-center font-medium underline underline-offset-4"
				>
					{t.backToSignIn}
				</Link>
			</AuthShell>
		);
	}

	return (
		<AuthShell title={t.title} intro={t.intro}>
			<form
				className="space-y-4"
				onSubmit={async (event) => {
					event.preventDefault();
					const value = String(new FormData(event.currentTarget).get("email"));
					setPending(true);
					setError(null);
					const result = await authClient.requestPasswordReset({
						email: value,
						redirectTo: `${window.location.origin}/reset-password`,
					});
					setPending(false);
					if (result.error) {
						setError(authErrorMessage(m, result.error, t.notSent));
						return;
					}
					setSentTo(value);
				}}
			>
				<div className="space-y-1.5">
					<Label htmlFor="email">{m.auth.login.email}</Label>
					<Input
						id="email"
						name="email"
						type="email"
						required
						autoComplete="email"
						defaultValue={email}
					/>
				</div>
				{error && <p className="text-destructive">{error}</p>}
				<Button type="submit" className="w-full" disabled={pending}>
					{t.send}
				</Button>
				<Link
					to="/login"
					className="block text-center text-muted-foreground hover:text-ink"
				>
					{t.backToSignIn}
				</Link>
			</form>
		</AuthShell>
	);
}
