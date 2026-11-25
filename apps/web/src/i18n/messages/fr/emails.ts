import { pluralizer } from "../../format";
import type { emails as en } from "../en/emails";

const p = pluralizer("fr");

const WHAT = {
	discord: "salon Discord",
	slack: "salon Slack",
	json: "webhook",
};
const A_WHAT = {
	discord: "Un salon Discord",
	slack: "Un salon Slack",
	json: "Un webhook",
};

export const emails: typeof en = {
	openLink: "Ou ouvrez ce lien :",
	greeting: (name) => (name ? `Bonjour ${name},` : "Bonjour,"),
	team: {
		footer: (label) =>
			`Vous recevez cet e-mail parce que « ${label} » est activé dans vos réglages de notifications Tattle.`,
		settings: "Réglages des notifications",
		unsubscribe: "Ne plus recevoir ces e-mails",
		openIssue: "Ouvrir le ticket",
	},
	assigned: {
		subject: (p) => `Ticket assigné : #${p.number} ${p.title}`,
		text: (p) =>
			`${p.actor} vous a assigné le ticket #${p.number} « ${p.title} » dans ${p.project}.`,
	},
	regression: {
		subject: (p) => `Régression : #${p.number} ${p.title}`,
		text: (p) =>
			`Le ticket #${p.number} « ${p.title} » de ${p.project} était terminé, et un nouveau signalement est arrivé${p.release ? ` depuis la version ${p.release}` : ""}. Il a été rouvert et remis dans « À faire ».`,
	},
	aiKey: {
		subject:
			"Votre clé d'IA pour les suggestions de doublons ne fonctionne plus",
		workspaceFallback: "votre espace de travail",
		refusal: {
			401: "la clé n'est pas valide ou a été révoquée",
			402: "le compte n'a plus de crédit",
			403: "la clé n'a pas le droit d'utiliser ce modèle",
			429: "le compte a dépassé sa limite de requêtes ou son quota",
		},
		text: (p) =>
			`${p.provider} refuse sans cesse la clé d'IA de ${p.workspace} : HTTP ${p.status}${p.meaning ? `, ${p.meaning}` : ""}.\n\nTant qu'elle ne fonctionne pas, les doublons ne sont suggérés que pour des textes presque identiques. Vérifiez la clé, son crédit ou son quota, puis cliquez sur Tester.`,
		action: "Ouvrir les réglages d'IA",
	},
	webhook: {
		what: WHAT,
		subject: (p) => `${A_WHAT[p.what]} de ${p.project} échoue sans cesse`,
		hostFallback: "l'adresse",
		text: (p) =>
			`Tattle a renoncé à envoyer ${p.event} au ${WHAT[p.what]} ${p.host} après 6 tentatives. Dernière erreur : ${p.error}.\n\nLes événements suivants lui sont toujours envoyés. Vous ne recevrez plus cet e-mail tant qu'un envoi ne réussit pas.`,
		action: (chat) =>
			chat ? "Ouvrir les réglages du salon" : "Ouvrir les réglages du webhook",
	},
	reporterReplied: {
		subject: (p) => `Réponse de l'auteur : #${p.number} ${p.title}`,
		reporterFallback: "L'auteur du signalement",
		intro: (p) =>
			`${p.who}, qui a signalé le ticket #${p.number} « ${p.title} » dans ${p.project}, a écrit${p.count > 1 ? ` ${p.count} messages` : ""} :`,
		outro:
			"Écrit par l'auteur du signalement, pas par votre équipe. Répondez depuis la page du ticket.",
	},
	digest: {
		subjectOne: (p) =>
			`Triage : ${p.count} ${p.count > 1 ? "nouveaux" : "nouveau"} dans ${p.project}`,
		subjectMany: (count) =>
			p(count, {
				one: "Triage : # nouveau ticket",
				other: "Triage : # nouveaux tickets",
			}),
		text: "Nouveaux depuis le dernier résumé, en attente dans le Triage :",
		listTitle: (p) =>
			`${p.project} : ${p.count} ${p.count > 1 ? "nouveaux" : "nouveau"}`,
		more: (count) => `et ${count} de plus`,
		action: "Ouvrir le Triage",
	},
	reporter: {
		footer:
			"Vous recevez cet e-mail parce que vous avez envoyé ce signalement.",
		stop: "Ne plus recevoir d'e-mails sur ce signalement",
	},
	reply: {
		subject: (title) => `Re : ${title}`,
		teamFallback: "l'équipe",
		text: (p) =>
			`${p.actor}, de ${p.project}, a répondu à votre signalement :\n\n${p.body}\n\nVous aviez écrit : « ${p.title} »`,
		action: "Lire et répondre",
	},
	shipped: {
		subject: (title) => `Disponible : ${title}`,
		text: (p) =>
			`Vous aviez demandé « ${p.title} » à ${p.project}. C'est maintenant disponible.\n\nMerci d'avoir pris le temps de le demander : c'est ainsi que nous choisissons ce que nous construisons ensuite.`,
		action: "Voir ce qui arrive bientôt",
	},
	invitation: {
		workspaceFallback: "son espace de travail",
		subject: (p) => `${p.inviter} vous invite dans ${p.workspace} sur Tattle`,
		text: (p) =>
			`${p.inviter} vous invite à rejoindre ${p.workspace} sur Tattle, où votre équipe trie les signalements de bugs et les demandes de fonctionnalités.\n\nCréez votre compte avec cette adresse e-mail (${p.email}) d'ici 7 jours.`,
		action: "Accepter l'invitation",
	},
	passwordReset: {
		subject: "Réinitialisez votre mot de passe Tattle",
		text: (name) =>
			`Bonjour ${name},\n\nQuelqu'un a demandé à réinitialiser le mot de passe de votre compte Tattle. Si c'est vous, choisissez un nouveau mot de passe avec le bouton ci-dessous. Le lien est valable une heure.\n\nSi ce n'est pas vous, ignorez cet e-mail : votre mot de passe ne change pas.`,
		action: "Choisir un nouveau mot de passe",
	},
};
