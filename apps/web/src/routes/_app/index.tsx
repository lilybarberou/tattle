import { createFileRoute, redirect } from "@tanstack/react-router";
import { getWorkspaceFn } from "#/server/fns";

export const Route = createFileRoute("/_app/")({
	beforeLoad: async () => {
		const { projects } = await getWorkspaceFn();
		const first = projects[0];
		if (!first) throw redirect({ to: "/onboarding" });
		throw redirect({
			to: "/p/$projectId/triage",
			params: { projectId: first.id },
		});
	},
});
