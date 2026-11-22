import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authErrorMessage } from "#/components/auth-shell";
import { Brand } from "#/components/brand";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/i18n/react";
import { authClient } from "#/lib/auth-client";
import { createProjectFn, getSessionFn, getWorkspaceFn } from "#/server/fns";

export const Route = createFileRoute("/onboarding")({
	beforeLoad: async () => {
		if (!(await getSessionFn())) throw redirect({ to: "/login" });
	},
	loader: () => getWorkspaceFn(),
	component: Onboarding,
});

function Onboarding() {
	const workspace = Route.useLoaderData();
	const navigate = useNavigate();
	const { m } = useI18n();
	const t = m.auth.onboarding;
	const existingOrg = workspace.organizations[0];
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setPending(true);
		setError(null);
		try {
			let organizationId = existingOrg?.id;
			if (!organizationId) {
				const name = String(form.get("organization"));
				const slug = `${
					name
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, "-")
						.replace(/^-|-$/g, "") || "team"
				}-${Math.random().toString(36).slice(2, 6)}`;
				const result = await authClient.organization.create({ name, slug });
				if (result.error || !result.data)
					throw new Error(
						result.error
							? authErrorMessage(m, result.error, t.orgNotCreated)
							: t.orgNotCreated,
					);
				organizationId = result.data.id;
			}
			const created = await createProjectFn({
				data: { organizationId, name: String(form.get("project")) },
			});
			await navigate({
				to: "/p/$projectId/settings",
				params: { projectId: created.id },
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : m.common.errors.generic);
			setPending(false);
		}
	};

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ground px-4 py-10">
			<Brand className="text-base" />
			<form
				onSubmit={onSubmit}
				className="w-full max-w-sm rounded-2xl border bg-surface p-7 space-y-5"
			>
				<div className="space-y-1">
					<h1 className="text-xl font-semibold">{t.title}</h1>
					<p className="text-muted-foreground">{t.intro}</p>
				</div>
				{!existingOrg && (
					<div className="space-y-1.5">
						<Label htmlFor="organization">{t.organization}</Label>
						<Input
							id="organization"
							name="organization"
							required
							placeholder={t.organizationPlaceholder}
						/>
					</div>
				)}
				<div className="space-y-1.5">
					<Label htmlFor="project">{t.projectName}</Label>
					<Input
						id="project"
						name="project"
						required
						placeholder={t.projectPlaceholder}
					/>
				</div>
				{error && <p className="text-destructive">{error}</p>}
				<Button type="submit" className="w-full" disabled={pending}>
					{t.create}
				</Button>
			</form>
		</main>
	);
}
