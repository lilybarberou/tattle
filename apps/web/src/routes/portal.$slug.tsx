import { createFileRoute } from "@tanstack/react-router";
import {
	loadPortal,
	NotPublished,
	PortalPage,
	portalHead,
	portalSearch,
} from "#/components/portal-page";

// The public feature-request page in English, at /portal/<slug> (French:
// /fr/portal/<slug>). A French-speaking browser arriving here with no
// remembered choice is sent once to the French address (src/start.ts).
export const Route = createFileRoute("/portal/$slug")({
	validateSearch: portalSearch,
	staticData: { pageLocale: "en" },
	loader: ({ params }) => loadPortal(params.slug),
	head: ({ loaderData, matches, params }) =>
		portalHead("en", params.slug, matches, loaderData),
	// The English address may redirect by Accept-Language and the cookie:
	// caches must keep one copy per language and choice.
	headers: () => ({ Vary: "Accept-Language, Cookie" }),
	notFoundComponent: NotPublished,
	component: Page,
});

function Page() {
	const data = Route.useLoaderData();
	const { slug } = Route.useParams();
	const { shipped } = Route.useSearch();
	return <PortalPage locale="en" slug={slug} shipped={shipped} data={data} />;
}
