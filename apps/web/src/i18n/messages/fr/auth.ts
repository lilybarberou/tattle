import type { auth as en } from "../en/auth";

export const auth: typeof en = {
	errorCodes: {
		INVALID_EMAIL_OR_PASSWORD: "E-mail ou mot de passe incorrect",
		INVALID_EMAIL: "Adresse e-mail invalide",
		INVALID_PASSWORD: "Mot de passe incorrect",
		USER_ALREADY_EXISTS: "Un compte utilise déjà cette adresse e-mail.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"Un compte utilise déjà cette adresse e-mail. Utilisez-en une autre.",
		PASSWORD_TOO_SHORT: "Mot de passe trop court",
		PASSWORD_TOO_LONG: "Mot de passe trop long",
		INVALID_TOKEN: "Ce lien n'est pas valide ou a expiré",
		ORGANIZATION_ALREADY_EXISTS: "Cette organisation existe déjà",
		PASSWORD_COMPROMISED:
			"Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre.",
	},
	tooManyAttempts: "Trop de tentatives. Réessayez dans quelques minutes.",
	login: {
		signIn: "Se connecter",
		createAdmin: "Créer le compte administrateur",
		createYours: "Créer votre compte",
		firstAccountIntro:
			"C'est le premier compte de ce serveur. Il possède l'espace de travail ; les inscriptions se ferment ensuite, et vous invitez les autres.",
		invitedAs: (email) => `Vous avez été invité avec l'adresse ${email}.`,
		wrongAccountTitle: "Cette invitation n'est pas destinée à ce compte",
		signedInAs: "Vous êtes connecté en tant que",
		sentToOther: (email) =>
			` L'invitation a été envoyée à ${email}, ou elle a déjà été utilisée, annulée ou a expiré.`,
		sentToAnother:
			" L'invitation a été envoyée à une autre adresse, ou elle a déjà été utilisée, annulée ou a expiré.",
		wrongAccountHelp: (email) =>
			`Déconnectez-vous, puis rouvrez le lien pour rejoindre l'espace avec l'adresse invitée. Ou demandez une nouvelle invitation pour ${email}.`,
		signOut: "Se déconnecter",
		goToDashboard: "Aller au tableau de bord",
		setupCode: "Code d'installation",
		setupCodeHelpBefore:
			"Dans les journaux du serveur, sur la ligne qui commence par",
		setupCodeHelpAfter: ". Il prouve que c'est vous qui gérez ce serveur.",
		name: "Nom",
		email: "E-mail",
		password: "Mot de passe",
		minLength: (count) => `Au moins ${count} caractères.`,
		forgot: "Mot de passe oublié ?",
		createAccount: "Créer le compte",
		haveAccount: "Vous avez déjà un compte ?",
		noAccount: "Pas encore de compte ?",
		createOne: "Créez-en un",
		invitationOnly:
			"Les comptes se créent sur invitation. Demandez à un membre de votre équipe.",
	},
	forgot: {
		checkInbox: "Consultez votre boîte de réception",
		sent: (email) =>
			`Si un compte utilise ${email}, nous lui avons envoyé un lien pour choisir un nouveau mot de passe. Le lien est valable une heure.`,
		backToSignIn: "Retour à la connexion",
		title: "Réinitialiser votre mot de passe",
		intro:
			"Saisissez l'e-mail de votre compte. Nous vous enverrons un lien pour choisir un nouveau mot de passe.",
		notSent: "L'e-mail n'a pas pu être envoyé",
		send: "Envoyer le lien",
	},
	reset: {
		expiredTitle: "Ce lien ne fonctionne plus",
		expiredIntro:
			"Les liens de réinitialisation ne servent qu'une fois, pendant une heure. Demandez-en un nouveau.",
		sendNew: "Envoyer un nouveau lien",
		title: "Choisir un nouveau mot de passe",
		different: "Les deux mots de passe sont différents.",
		notChanged: "Le mot de passe n'a pas été modifié",
		changed:
			"Mot de passe modifié. Connectez-vous avec le nouveau mot de passe.",
		newPassword: "Nouveau mot de passe",
		help: (count) =>
			`Au moins ${count} caractères. Vous serez déconnecté partout ailleurs.`,
		repeat: "Confirmez-le",
		change: "Modifier le mot de passe",
	},
	onboarding: {
		orgNotCreated: "Impossible de créer l'organisation",
		title: "Créer un projet",
		intro:
			"Un projet reçoit les signalements d'une application. Vous obtenez le code du widget juste après.",
		organization: "Organisation",
		organizationPlaceholder: "Atelier Nord",
		projectName: "Nom du projet",
		projectPlaceholder: "Mon application",
		create: "Créer le projet",
	},
	consent: {
		scopes: {
			openid: "Savoir qui vous êtes",
			profile: "Voir votre nom",
			email: "Voir votre adresse e-mail",
			offline_access: "Rester connecté jusqu'à ce que vous révoquiez l'accès",
		},
		anMcpClient: "Un client MCP",
		title: (name) => `Autoriser ${name} ?`,
		actsAs: "Il agira en tant que",
		actsAsAfter:
			"via MCP : lire les tickets et les signalements, les trier, les commenter et les mettre à jour dans vos projets.",
		allowing: "Autorisation…",
		allow: "Autoriser",
		deny: "Refuser",
		disconnect:
			"Vous pouvez le déconnecter à tout moment depuis Agents et API.",
	},
};
