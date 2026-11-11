import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import * as z from "zod";
import { AuthShell } from "#/components/auth-shell";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/forgot-password")({
	validateSearch: z.object({ email: z.string().optional() }),
	component: ForgotPassword,
});

function ForgotPassword() {
	const { email } = Route.useSearch();
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	if (sentTo) {
		return (
			<AuthShell
				title="Check your inbox"
				intro={`If an account uses ${sentTo}, we sent it a link to choose a new password. The link works for one hour.`}
			>
				<Link
					to="/login"
					className="block text-center font-medium underline underline-offset-4"
				>
					Back to sign in
				</Link>
			</AuthShell>
		);
	}

	return (
		<AuthShell
			title="Reset your password"
			intro="Enter the email of your account. We'll send you a link to choose a new password."
		>
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
						setError(result.error.message ?? "The email could not be sent");
						return;
					}
					setSentTo(value);
				}}
			>
				<div className="space-y-1.5">
					<Label htmlFor="email">Email</Label>
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
					Send the link
				</Button>
				<Link
					to="/login"
					className="block text-center text-muted-foreground hover:text-ink"
				>
					Back to sign in
				</Link>
			</form>
		</AuthShell>
	);
}
