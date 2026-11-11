import { createFileRoute, Outlet } from "@tanstack/react-router";
import { getProjectFn } from "#/server/fns";

export const Route = createFileRoute("/_app/p/$projectId")({
	loader: ({ params }) =>
		getProjectFn({ data: { projectId: params.projectId } }),
	component: Outlet,
});
