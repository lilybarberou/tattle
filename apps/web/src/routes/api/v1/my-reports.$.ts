import { createFileRoute } from "@tanstack/react-router";
import { clientIp } from "#/server/rate-limit";
import { handleReporterRequest } from "#/server/reporter-api";

// "My reports" in the widgets: a reporter follows their reports and talks
// with the team. See src/server/reporter-api.ts.
const handle = ({
	request,
	params,
}: {
	request: Request;
	params: { _splat?: string };
}) => handleReporterRequest(request, params._splat ?? "", clientIp());

export const Route = createFileRoute("/api/v1/my-reports/$")({
	server: {
		handlers: { GET: handle, POST: handle, OPTIONS: handle },
	},
});
