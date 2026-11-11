import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import * as z from "zod";
import { AuthShell } from "#/components/auth-shell";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient } from "#/lib/auth-client";
import { getSignupStateFn } from "#/server/fns";

// Better Auth sends people here as /reset-password?token=… (or ?error=… when
// the link is invalid or expired).
export const Route = createFileRoute("/reset-password")({
	validateSearch: z.object({
		token: z.string().optional(),
		error: z.string().optional(),
	}),
	loader: () => getSignupStateFn({ data: {} }),
	component: ResetPassword,
});

function ResetPassword() {
	const { token, error: linkError } = Route.useSearch();
	const { minPasswordLength } = Route.useLoaderData();
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	if (!token || linkError) {
		return (
			<AuthShell
				title="This link no longer works"
				intro="Reset links work once, for one hour. Ask for a new one."
			>
				<Link
					to="/forgot-password"
					className="block text-center font-medium underline underline-offset-4"
				>
					Send a new link
				</Link>
			</AuthShell>
		);
	}

	return (
		<AuthShell title="Choose a new password">
			<form
				className="space-y-4"
				onSubmit={async (event) => {
					event.preventDefault();
					const form = new FormData(event.currentTarget);
					const password = String(form.get("password"));
					if (password !== String(form.get("confirm"))) {
						setError("The two passwords are different.");
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
						setError(result.error.message ?? "The password was not changed");
						return;
					}
					toast.success("Password changed. Sign in with the new one.");
					await navigate({ to: "/login" });
				}}
			>
				<div className="space-y-1.5">
					<Label htmlFor="password">New password</Label>
					<Input
						id="password"
						name="password"
						type="password"
						required
						minLength={minPasswordLength}
						autoComplete="new-password"
					/>
					<p className="text-xs text-muted-foreground">
						At least {minPasswordLength} characters. You'll be signed out
						everywhere else.
					</p>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="confirm">Repeat it</Label>
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
					Change password
				</Button>
			</form>
		</AuthShell>
	);
}
