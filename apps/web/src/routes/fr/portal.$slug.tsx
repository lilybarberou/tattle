import { createFileRoute } from "@tanstack/react-router";
import {
	loadPortal,
	NotPublished,
	PortalPage,
	portalHead,
	portalSearch,
} from "#/components/portal-page";

// The public feature-request page in French, at /fr/portal/<slug>
// (English: /portal/<slug>), whatever the browser's language.
export const Route = createFileRoute("/fr/portal/$slug")({
	validateSearch: portalSearch,
	staticData: { pageLocale: "fr" },
	loader: ({ params }) => loadPortal(params.slug),
	head: ({ loaderData, matches, params }) =>
		portalHead("fr", params.slug, matches, loaderData),
	notFoundComponent: NotPublished,
	component: Page,
});

function Page() {
	const data = Route.useLoaderData();
	const { slug } = Route.useParams();
	const { shipped } = Route.useSearch();
	return <PortalPage locale="fr" slug={slug} shipped={shipped} data={data} />;
}
