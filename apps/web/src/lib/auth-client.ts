import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	// oauthProviderClient carries a pending OAuth authorization (an MCP client
	// signing in) through sign-in and consent.
	plugins: [organizationClient(), oauthProviderClient()],
});

/** After sign-in or consent, the server may send the browser on to an OAuth client. */
export const followRedirect = (data: unknown) => {
	const url =
		data &&
		typeof data === "object" &&
		"url" in data &&
		typeof data.url === "string"
			? data.url
			: null;
	if (
		url &&
		"redirect" in (data as object) &&
		(data as { redirect?: boolean }).redirect !== false
	) {
		window.location.href = url;
		return true;
	}
	return false;
};
