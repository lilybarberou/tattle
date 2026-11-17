import Script from "next/script";

// Tattle's own feedback goes to Tattle: the "Tattle" project on the team's
// instance. The key is public by design (it ships in every page that embeds
// the widget); the project only accepts reports from the sites listed in its
// settings, so copies of this page elsewhere, or `next dev`, are refused.
const TATTLE_URL = "https://tattle-app.bylily.me";
const PROJECT_KEY = "pk_ad6fa764b55509770c0f3cefaf42ca82";

/** The real widget, loaded once the page is idle, in the landing's colors. */
export function FeedbackWidget() {
	return (
		<Script
			src={`${TATTLE_URL}/widget.js`}
			strategy="lazyOnload"
			data-project-key={PROJECT_KEY}
			data-locale="fr"
			data-color-scheme="light"
			data-release="landing"
		/>
	);
}
