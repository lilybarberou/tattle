import { pluralizer } from "../../format";
import type { chat as en } from "../en/chat";

const p = pluralizer("fr");

const TYPE = { bug: "Bug", feature: "Idée" };

export const chat: typeof en = {
	ping: {
		title: "Tattle est connecté",
		text: "Les nouveaux signalements, les changements de statut et les commentaires apparaîtront dans ce salon.",
	},
	someone: "Quelqu'un",
	type: TYPE,
	reportTitle: (p) => `${TYPE[p.type]} #${p.number} : ${p.title}`,
	consoleErrors: (count) =>
		p(count, { one: "# erreur de console", other: "# erreurs de console" }),
	failedRequests: (count) =>
		p(count, { one: "# requête en échec", other: "# requêtes en échec" }),
	screenshot: "capture d'écran jointe",
	from: "De",
	page: "Page",
	screen: "Écran",
	evidence: "Indices",
	opened: (p) => `#${p.number} ouvert : ${p.title}`,
	openedBy: (p) =>
		`${p.actor} a ouvert ${p.type === "bug" ? "un bug" : "une demande"}.`,
	mergedInto: (p) => `Fusionné dans #${p.number} ${p.title}`,
	assignedTo: (name) => `Assigné à **${name}**`,
	unassigned: "Plus assigné",
	pullRequest: (url) => `Pull request : ${url}`,
	commentOn: (p) => `Commentaire sur #${p.number} ${p.title}`,
	reporterReplied: (p) =>
		`L'auteur du signalement a répondu sur #${p.number} ${p.title}`,
	replyToReporter: (p) =>
		`Réponse à l'auteur du signalement sur #${p.number} ${p.title}`,
	agent: "agent",
};
