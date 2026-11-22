import { pluralizer } from "../../format";
import type { publicPages as en } from "../en/publicPages";

const p = pluralizer("fr");

export const publicPages: typeof en = {
	linkBroken: "Ce lien ne fonctionne pas",
	linkBrokenHelp:
		"Il est peut-être incomplet : rouvrez-le depuis l'e-mail, sans le modifier.",
	portal: {
		title: "Demandes",
		pageTitle: (project) => `${project} · Demandes`,
		notPublished: "Cette page n'est pas publiée",
		notPublishedHelp:
			"L'adresse est peut-être erronée, ou l'équipe a désactivé cette page.",
		status: {
			backlog: "À l'étude",
			todo: "Prévu",
			in_progress: "En cours",
			in_review: "En cours",
			done: "Disponible",
		},
		voteNotSaved: "Votre vote n'a pas été enregistré",
		voteLabel: "Voter, ",
		votes: (count) => p(count, { one: " vote", other: " votes" }),
		intro:
			"Votez pour ce que vous voulez voir arriver, ou proposez une nouvelle idée. Nous lisons chacune d'elles.",
		suggest: "Suggérer une idée",
		views: "Vues",
		open: "Ouvertes",
		shipped: "Disponibles",
		emailWhenShips: "Nous vous écrirons quand ce sera disponible",
		notifyQuestion: (title) =>
			`Recevoir un e-mail quand « ${title} » sera disponible ?`,
		emailPlaceholder: "vous@entreprise.fr",
		notifyMe: "Me prévenir",
		noThanks: "Non merci",
		nothingShipped: "Rien de cette liste n'est encore disponible.",
		noIdeas: "Aucune idée pour l'instant. Soyez le premier à en proposer une.",
		privacy:
			"Vos votes sont mémorisés dans ce navigateur. Votre e-mail sert uniquement à vous prévenir quand une idée est disponible.",
		thanks: "Merci ! L'équipe va examiner votre idée.",
		suggestIntro:
			"L'équipe examine les nouvelles idées avant qu'elles n'apparaissent sur cette page.",
		ideaTitle: "Votre idée en une ligne",
		ideaDescription: "Que vous permettrait-elle de faire ?",
		ideaEmail: "E-mail (facultatif)",
		ideaEmailPlaceholder: "Pour être prévenu de sa sortie",
		send: "Envoyer l'idée",
	},
	thread: {
		pageTitle: (project) => `${project} · Votre signalement`,
		title: "Votre signalement",
		expired: "Ce lien a expiré",
		expiredHelp:
			"Les liens de nos e-mails sont valables 30 jours. La prochaine réponse de l'équipe en contiendra un nouveau, et le bouton de retour de l'application affiche aussi vos signalements.",
		sent: "Envoyé. L'équipe va le lire.",
		bugSent: "Bug signalé",
		ideaSent: "Idée envoyée",
		you: "Vous",
		yourReply: "Votre réponse",
		placeholder: "Écrire à l'équipe…",
		send: "Envoyer",
		footer:
			"Toute personne disposant de ce lien peut lire cette conversation et y répondre. Il est valable 30 jours.",
	},
	unsubscribe: {
		pageTitle: "Se désabonner",
		reportDone: "Vous ne recevrez plus d'e-mails sur ce signalement",
		reportAsk: "Arrêter les e-mails ?",
		reportDoneText: (project) =>
			`${project} ne vous écrira plus à ce sujet. Les réponses restent visibles dans le bouton de retour de l'application.`,
		reportAskText: (project, title) =>
			`À propos de votre signalement à ${project} : « ${title} ». Vous ne recevrez plus par e-mail les réponses de l'équipe ni l'avis de correction.`,
		stopReport: "Ne plus recevoir d'e-mails sur ce signalement",
		done: "Désabonnement confirmé",
		ask: "Se désabonner ?",
		doneText: (label) => `Vous ne recevrez plus les e-mails « ${label} ».`,
		askText: (label) =>
			`Vous ne recevrez plus les e-mails « ${label} » de Tattle.`,
		turnBackOn:
			"Réactivez-les, ou désactivez-en d'autres, dans vos paramètres de notification.",
		unsubscribe: "Se désabonner",
		settings: "Paramètres de notification",
	},
};
