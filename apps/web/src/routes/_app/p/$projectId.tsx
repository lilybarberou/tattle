import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { errorStatus } from "#/components/status-page";
import { getProjectFn } from "#/server/fns";

export const Route = createFileRoute("/_app/p/$projectId")({
	loader: async ({ params }) => {
		try {
			return await getProjectFn({ data: { projectId: params.projectId } });
		} catch (error) {
			// A wrong or deleted project: the "doesn't exist" page, not an error.
			if (errorStatus(error) === 404) throw notFound();
			throw error;
		}
	},
	component: Outlet,
});
