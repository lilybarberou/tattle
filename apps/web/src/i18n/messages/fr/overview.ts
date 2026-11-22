import { numberer, pluralizer } from "../../format";
import type { overview as en } from "../en/overview";

const p = pluralizer("fr");
const n = numberer("fr");

export const overview: typeof en = {
	title: "Vue d'ensemble",
	description: {
		nothing: "Aucun signalement ces 30 derniers jours.",
		reports: (count) =>
			`${p(count, { one: "# signalement", other: "# signalements" })} ces 30 derniers jours`,
		end: ".",
		same: ", autant que les 30 jours précédents.",
		up: (previous) => `, contre ${n(previous)} auparavant.`,
		down: (previous) => `, contre ${n(previous)} auparavant.`,
		triageClear: "Le Triage est vide.",
		waiting: (count) =>
			`${p(count, { one: "# ticket attend", other: "# tickets attendent" })} dans le Triage.`,
	},
	reports30: "Signalements, 30 jours",
	noneYet: "Aucun pour l'instant",
	previous30: (count) => `${n(count)} les 30 jours précédents`,
	inTriage: "Dans le Triage",
	oldestArrived: "Le plus ancien est arrivé",
	inboxClear: "Rien à trier",
	resolved30: "Résolus, 30 jours",
	over90: (value) => `${value} sur 90 jours`,
	medianTime: "Délai médian de résolution",
	nothingDone: "Rien n'est encore passé à Terminé",
	duration: {
		minutes: (count) => `${n(count)} min`,
		hours: (count) => `${n(count)} h`,
		days: (count) => `${n(count)} ${count < 2 ? "jour" : "jours"}`,
	},
	perDay: "Signalements par jour",
	perDayAside: (count) =>
		`30 derniers jours, UTC · ${p(count, { one: "# signalement", other: "# signalements" })}`,
	noReports:
		"Aucun signalement ces 30 derniers jours. Quand des personnes envoient un bug ou une idée depuis le widget, chaque jour apparaît ici.",
	openIssues: "Tickets ouverts",
	issues: (count) => p(count, { one: "# ticket", other: "# tickets" }),
	mostReported: "Les plus signalés",
	noReported:
		"Aucun ticket ouvert n'a encore de signalement. Ceux que beaucoup de personnes rencontrent remontent ici.",
	reports: (count) =>
		p(count, { one: "# signalement", other: "# signalements" }),
	mostVoted: "Demandes les plus votées",
	fromPublicPage: "Depuis la page publique",
	votes: (count) => p(count, { one: "# vote", other: "# votes" }),
	chart: {
		bugs: "Bugs",
		features: "Demandes",
		slider: "Signalements par jour, 30 derniers jours",
		day: (date, bugs, features) =>
			`${date} : ${p(bugs, { one: "# bug", other: "# bugs" })}, ${p(features, { one: "# demande", other: "# demandes" })}`,
		caption: "Signalements par jour",
		dayColumn: "Jour",
	},
};
