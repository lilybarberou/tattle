import type { errors as en } from "../en/errors";

const n = (value: number) => value.toLocaleString("fr");

export const errors: typeof en = {
	internal: "Erreur interne du serveur",
	onlyPeopleHaveSettings: "Seules les personnes ont des réglages",

	notSignedIn: "Vous n'êtes pas connecté",
	unknownUser: "Compte inconnu",
	invalidApiToken: "Jeton d'API invalide",
	appDisconnected: "Cette application a été déconnectée",
	tokenReadOnly: "Ce jeton d'API est en lecture seule",
	notAMember: "Vous n'êtes pas membre de cet espace de travail",
	onlyAdmins: "Seuls les propriétaires et les admins peuvent faire cela",
	onlyAdminsInvite:
		"Seuls les propriétaires et les admins peuvent inviter des personnes",
	onlyAdminsRevokeToken:
		"Seuls les propriétaires et les admins peuvent révoquer le jeton de quelqu'un d'autre",
	onlyAdminsAiSettings:
		"Seuls les propriétaires et les admins peuvent modifier les réglages d'IA",
	onlyMembersCreateTokens: "Seuls les membres peuvent créer des jetons",
	onlyPeopleHaveNotificationSettings:
		"Seules les personnes ont des réglages de notifications",
	signInFirst: "Connectez-vous d'abord",

	projectNotFound: "Projet introuvable",
	projectNotCreated: "Le projet n'a pas pu être créé",
	unknownProjectKey: "Clé de projet inconnue",
	originNotAllowed: "Cette origine n'est pas autorisée pour ce projet",
	invalidOrigin: (p) =>
		`« ${p.origin} » n'est pas une origine. Indiquez seulement le protocole et l'hôte, par exemple https://shop.atelier-nord.fr`,
	invalidPortalSlug:
		"L'adresse compte de 3 à 40 caractères : lettres minuscules, chiffres ou tirets.",
	portalSlugTaken: "Cette adresse est déjà prise.",
	confirmProjectName: (p) =>
		`Saisissez le nom du projet, « ${p.name} », pour confirmer.`,

	unknownMember: "Membre inconnu",
	unknownAgent: "Agent inconnu",
	invitationGone:
		"Cette invitation a déjà servi, a été annulée ou a expiré. Créez-en une nouvelle.",

	issueNotFound: "Ticket introuvable",
	issueNumberNotFound: (p) => `Ticket #${p.number} introuvable`,
	reportNotFound: "Signalement introuvable",
	reportNotSaved: "Le signalement n'a pas pu être enregistré",
	fileNotFound: "Fichier introuvable",
	titleRequired: "Le titre est obligatoire",
	titleEmpty: "Le titre ne peut pas être vide",
	titleTooLong: (p) => `Un titre compte au plus ${n(p.max)} caractères`,
	descriptionTooLong: (p) =>
		`Une description compte au plus ${n(p.max)} caractères`,
	commentEmpty: "Le commentaire ne peut pas être vide",
	commentTooLong: (p) => `Un commentaire compte au plus ${n(p.max)} caractères`,
	prUrlInvalid:
		"L'URL de la pull request doit commencer par http:// ou https://",
	useMarkDuplicate:
		"Utilisez mark_duplicate pour marquer un ticket comme doublon",
	priorityRange: "La priorité doit être un nombre entier de 0 à 4",
	cannotDuplicateItself: "Un ticket ne peut pas être son propre doublon",
	duplicateOfDuplicate: (p) =>
		`Le ticket #${p.number} est lui-même un doublon : utilisez plutôt l'original`,
	reporterKeyInvalid:
		"reporterKey doit compter de 32 à 128 lettres, chiffres, tirets ou tirets bas",
	screenshotFormat:
		"La capture d'écran doit être une data URL PNG, JPEG ou WebP",
	screenshotTooLarge: "La capture d'écran dépasse 8 Mo",

	writeMessageFirst: "Écrivez d'abord un message",
	messageTooLong: (p) => `Les messages comptent au plus ${n(p.max)} caractères`,
	messageNotSaved: "Le message n'a pas pu être enregistré",
	onlyPeopleAndAgentsReply:
		"Seules les personnes et les agents peuvent répondre",
	linkExpired: "Ce lien a expiré",
	unknownLink: "Lien inconnu",
	tooManyMessages: "Trop de messages. Réessayez dans quelques minutes.",

	portalPageNotFound: "Cette page n'existe pas",
	requestNotPublic: "Cette demande n'est pas publique",
	alreadyShipped: "Celle-ci est déjà disponible",
	voteFirst: "Votez d'abord",
	tooManyActions: "Trop d'actions. Réessayez dans quelques minutes.",

	webhookUrlRequired: "Saisissez l'URL http ou https du point de terminaison",
	webhookNotCreated: "Le webhook n'a pas pu être créé",
	privateWebhookRefused:
		"Cette adresse est sur la machine du serveur ou sur son réseau privé. Pour y envoyer des webhooks, définissez ALLOW_PRIVATE_URLS=true sur le serveur",

	aiBaseUrlRequired:
		"Saisissez l'URL de base du serveur, par exemple https://api.mistral.ai/v1 ou http://localhost:11434/v1",
	privateAiUrlRefused:
		"Cette adresse est sur la machine du serveur ou sur son réseau privé. Pour y utiliser un modèle (Ollama, LM Studio…), définissez ALLOW_PRIVATE_URLS=true sur le serveur",
	aiModelRequired: "Saisissez le modèle à utiliser",
	aiModelTooLong: "Ce nom de modèle est trop long",
	aiKeyTooLong: "Cette clé est trop longue",
	aiKeyRequired: (p) =>
		`Ajoutez votre clé d'API ${p.provider} pour activer les suggestions`,
	wrongSetupCode:
		"Code de configuration incorrect. Il se trouve dans les journaux du serveur, sur la ligne qui commence par [setup].",
	signupClosed:
		"Les inscriptions sont fermées sur ce serveur. Ouvrez le lien d'invitation que vous avez reçu, ou demandez à un membre d'inviter votre adresse e-mail.",
};
