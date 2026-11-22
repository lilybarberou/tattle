import { pluralizer } from "../../format";
import type { common as en } from "../en/common";

const p = pluralizer("fr");

export const common: typeof en = {
	product: "Tattle",
	tagline: "Les bugs et les idées de vos utilisateurs, triés par vos agents.",
	status: {
		triage: "Triage",
		backlog: "Backlog",
		todo: "À faire",
		in_progress: "En cours",
		in_review: "En revue",
		done: "Terminé",
		canceled: "Écarté",
		duplicate: "Doublon",
	},
	statusHint: {
		triage: "Nouveau, rien n'est décidé",
		backlog: "Accepté, pas encore prévu",
		todo: "Prévu pour la suite",
		in_progress: "Quelqu'un s'en occupe",
		in_review: "Correctif en attente de relecture",
		done: "Corrigé ou livré",
		canceled: "Ne sera pas fait",
		duplicate: "Fusionné dans un autre ticket",
	},
	priority: {
		none: "Sans priorité",
		urgent: "Urgente",
		high: "Haute",
		medium: "Moyenne",
		low: "Basse",
	},
	type: { bug: "Bug", feature: "Demande" },
	reporterStatus: {
		received: "Reçu",
		planned: "Prévu",
		in_progress: "En cours",
		fixed: "Corrigé",
		wont_fix: "Non retenu",
	},
	role: { owner: "Propriétaire", admin: "Admin", member: "Membre" },
	actions: {
		save: "Enregistrer",
		saving: "Enregistrement…",
		saved: "Enregistré",
		cancel: "Annuler",
		delete: "Supprimer",
		remove: "Retirer",
		close: "Fermer",
		copy: "Copier",
		copied: "Copié",
		edit: "Modifier",
		retry: "Réessayer",
		back: "Retour",
		continue: "Continuer",
		send: "Envoyer",
		sending: "Envoi…",
		search: "Rechercher",
		confirm: "Confirmer",
	},
	errors: {
		generic: "Une erreur est survenue",
		notSaved: "Non enregistré",
		notSent: "Non envoyé",
		couldNotSave: "Impossible d'enregistrer",
		couldNotDelete: "Impossible de supprimer",
		copyFailed: "Impossible de copier",
	},
	you: "Vous",
	someone: "Quelqu'un",
	nobody: "Personne",
	agentName: (name) => `${name} (agent)`,
	reports: (count) =>
		p(count, { one: "# signalement", other: "# signalements" }),
	issues: (count) => p(count, { one: "# ticket", other: "# tickets" }),
	notificationType: {
		reporter_replied: {
			label: "Un auteur de signalement a répondu",
			description: (minutes) =>
				`Quand une personne qui a envoyé un signalement vous répond. L'e-mail va à la personne assignée au ticket ; sinon, aux membres de l'équipe qui ont répondu dans cette conversation, ou à défaut aux propriétaires et admins. Les messages envoyés en moins de ${minutes} minutes arrivent dans un seul e-mail.`,
		},
		assigned: {
			label: "Un ticket vous est assigné",
			description:
				"Quand quelqu'un d'autre ou un agent vous assigne un ticket. Jamais quand vous vous l'assignez vous-même.",
		},
		regression: {
			label: "Un bug corrigé est revenu",
			description:
				"Quand un bug terminé reçoit un nouveau signalement et est rouvert. L'e-mail va à la personne assignée, ou aux propriétaires et admins si personne ne l'est.",
		},
		triage_digest: {
			label: "Résumé quotidien du triage",
			description:
				"Une fois par jour, les nouveaux tickets en attente dans le Triage de chaque projet, seulement les jours où il y a du nouveau. Activé par défaut pour les propriétaires et admins.",
		},
		ai_key_failing: {
			label: "La clé d'IA ne fonctionne plus",
			description:
				"Quand le fournisseur d'IA refuse sans cesse la clé de l'espace de travail (révoquée, plus de crédit, quota dépassé). Au plus une fois par jour.",
		},
		webhook_failing: {
			label: "Un webhook échoue sans cesse",
			description:
				"Quand un webhook, un salon Discord ou Slack échoue encore après ses nouvelles tentatives. Une seule fois, jusqu'à ce qu'un envoi réussisse de nouveau.",
		},
	},
	validation: {
		required: "Remplissez ce champ",
		tooShort: (min) => `Trop court : au moins ${min} caractères`,
		tooLong: (max) => `Trop long : au plus ${max} caractères`,
		email: "Saisissez une adresse e-mail valide",
		url: "Saisissez une adresse valide, qui commence par https://",
		invalid:
			"Certaines valeurs ne sont pas valides. Vérifiez le formulaire et réessayez.",
	},
	language: {
		label: "Langue",
		auto: "Automatique (langue du navigateur)",
		description:
			"Celle du tableau de bord et des e-mails que Tattle vous envoie. « Automatique » suit votre navigateur.",
	},
};
