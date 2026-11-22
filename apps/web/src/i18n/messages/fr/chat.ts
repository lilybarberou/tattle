import { pluralizer } from "../../format";
import type { chat as en } from "../en/chat";

const p = pluralizer("fr");

export const chat: typeof en = {
	ping: {
		title: "Tattle est connecté",
		text: "Les nouveaux signalements, les changements de statut et les commentaires apparaîtront dans ce salon.",
	},
	someone: "Quelqu'un",
	agent: "agent",
	consoleErrors: (count) =>
		p(count, { one: "# erreur de console", other: "# erreurs de console" }),
	failedRequests: (count) =>
		p(count, { one: "# requête en échec", other: "# requêtes en échec" }),
	screenshot: "capture d'écran jointe",
	unassigned: "Personne",
	reportedAfterDone: "signalé à nouveau après sa résolution",
	fields: {
		reporter: "Auteur",
		email: "E-mail",
		userId: "Id utilisateur",
		page: "Page",
		screen: "Écran",
		device: "Appareil",
		app: "App",
		release: "Version",
		language: "Langue",
		evidence: "Indices",
		duplicate: "Doublon possible de",
		type: "Type",
		createdBy: "Créé par",
		priority: "Priorité",
		labels: "Étiquettes",
		status: "Statut",
		mergedInto: "Fusionné dans",
		regression: "Régression dans",
		assignee: "Assigné à",
		pullRequest: "Pull request",
		by: "Par",
		author: "Auteur",
		from: "De",
		to: "À",
	},
};
