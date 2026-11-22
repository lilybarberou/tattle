import { pluralizer } from "../../format";
import type { triage as en } from "../en/triage";

const p = pluralizer("fr");

export const triage: typeof en = {
	title: "Triage",
	anonymous: "Anonyme",
	errors: (count) => p(count, { one: "# erreur", other: "# erreurs" }),
	failed: (count) => `${count} en échec`,
	hasScreenshot: "Avec une capture d'écran",
	accepted: (number) => `#${number} accepté dans le Backlog`,
	declined: (number) => `#${number} écarté`,
	merged: (number, original) => `#${number} fusionné dans #${original}`,
	queueLabel: "Signalements en attente de décision",
	nothingWaiting: "Rien n'attend de décision.",
	withErrors: (count, total) =>
		p(count, {
			one: `# sur ${total} est arrivé avec des erreurs de console ou des requêtes en échec.`,
			other: `# sur ${total} sont arrivés avec des erreurs de console ou des requêtes en échec.`,
		}),
	newOldestFirst: (count) =>
		p(count, {
			one: "# nouveau, les plus anciens d'abord.",
			other: "# nouveaux, les plus anciens d'abord.",
		}),
	emptyText:
		"Les nouveaux signalements du widget arrivent ici. Votre agent peut aussi les trier, via MCP.",
	installWidget: "Installer le widget",
	recentlyDecided: "Décidés récemment",
	keyMove: "naviguer",
	keyAccept: "accepter",
	keyMerge: "fusionner",
	keyDecline: "écarter",
	selectedLabel: "Signalement sélectionné",
	backToQueue: "Retour à la file",
	position: (index, total) => `${index} sur ${total}`,
	accept: "Accepter",
	merge: "Fusionner",
	decline: "Écarter",
	openFullIssue: "Ouvrir le ticket complet",
	peopleReported: (count) =>
		p(count, {
			one: "# personne l'a signalé.",
			other: "# personnes l'ont signalé.",
		}),
	seeEveryReport: "Voir tous les signalements",
	decisionLabel: "Décision",
	setBeforeAccepting: "À régler avant d'accepter",
	writtenInDashboard: "Ce ticket a été rédigé dans le tableau de bord.",
	allCaughtUp: "Tout est à jour.",
	seeOpenIssues: "Voir les tickets ouverts",
	duplicate: {
		label: "Doublon possible",
		looksLike: "Ressemble à",
		byAi: "suggéré par votre IA",
		byText: "formulation presque identique",
		mergeInto: (number) => `Fusionner dans #${number}`,
		notDuplicate: "Pas un doublon",
	},
	mergeDialog: {
		title: (number) => `Fusionner #${number ?? ""} dans…`,
		description:
			"Ses signalements passent dans le ticket choisi : vous gardez toutes les personnes qui ont rencontré le problème.",
		placeholder: "Rechercher par mots ou par #numéro",
		searching: "Recherche…",
		noResult: "Aucun ticket similaire. Essayez d'autres mots.",
		results: "Résultats",
		similar: "Tickets similaires",
	},
	requests: {
		title: "Demandes",
		shippedCount: (count) =>
			p(count, { one: "# disponible.", other: "# disponibles." }),
		summary: (people, ideas, leader, demand) =>
			`${p(people, { one: "# demande", other: "# demandes" })} pour ${p(ideas, { one: "# idée", other: "# idées" })}. La plus demandée : « ${leader} » (${demand}).`,
		newRequest: "Nouvelle demande",
		views: "Vues",
		mostRequested: "Les plus demandées",
		shipped: "Disponibles",
		emptyShipped:
			"Rien de disponible pour l'instant. Les demandes que vous passez en Terminé arrivent ici, pour prévenir les personnes qui les ont faites.",
		emptyOpen:
			"Aucune demande ouverte. Les utilisateurs envoient leurs idées depuis l'onglet « Suggérer une idée » du widget ; les idées similaires fusionnées s'additionnent ici.",
		people: (count) => p(count, { one: "personne", other: "personnes" }),
	},
};
