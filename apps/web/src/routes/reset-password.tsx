import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";
import { AuthShell, authErrorMessage } from "#/components/auth-shell";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/i18n/react";
import { authClient } from "#/lib/auth-client";
import { lenient } from "#/lib/search-params";
import { getSignupStateFn } from "#/server/fns";

// Better Auth sends people here as /reset-password?token=… (or ?error=… when
// the link is invalid or expired).
export const Route = createFileRoute("/reset-password")({
	validateSearch: z.object({
		token: lenient(z.string()),
		error: lenient(z.string()),
	}),
	loader: () => getSignupStateFn({ data: {} }),
	component: ResetPassword,
});

function ResetPassword() {
	const { token, error: linkError } = Route.useSearch();
	const { minPasswordLength } = Route.useLoaderData();
	const navigate = useNavigate();
	const { m } = useI18n();
	const t = m.auth.reset;
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	if (!token || linkError) {
		return (
			<AuthShell title={t.expiredTitle} intro={t.expiredIntro}>
				<Link
					to="/forgot-password"
					className="block text-center font-medium underline underline-offset-4"
				>
					{t.sendNew}
				</Link>
			</AuthShell>
		);
	}

	return (
		<AuthShell title={t.title}>
			<form
				className="space-y-4"
				onSubmit={async (event) => {
					event.preventDefault();
					const form = new FormData(event.currentTarget);
					const password = String(form.get("password"));
					if (password !== String(form.get("confirm"))) {
						setError(t.different);
						return;
					}
					setPending(true);
					setError(null);
					const result = await authClient.resetPassword({
						newPassword: password,
						token,
					});
					setPending(false);
					if (result.error) {
						setError(authErrorMessage(m, result.error, t.notChanged));
						return;
					}
					toast.success(t.changed);
					await navigate({ to: "/login" });
				}}
			>
				<div className="space-y-1.5">
					<Label htmlFor="password">{t.newPassword}</Label>
					<Input
						id="password"
						name="password"
						type="password"
						required
						minLength={minPasswordLength}
						autoComplete="new-password"
					/>
					<p className="text-xs text-muted-foreground">
						{t.help(minPasswordLength)}
					</p>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="confirm">{t.repeat}</Label>
					<Input
						id="confirm"
						name="confirm"
						type="password"
						required
						minLength={minPasswordLength}
						autoComplete="new-password"
					/>
				</div>
				{error && <p className="text-destructive">{error}</p>}
				<Button type="submit" className="w-full" disabled={pending}>
					{t.change}
				</Button>
			</form>
		</AuthShell>
	);
}
