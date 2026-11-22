import type { settings as en } from "../en/settings";

export const settings: typeof en = {
	title: "Paramètres du projet",
	description: (name, key) => `${name} · clé publique ${key}`,
	ownersAndAdminsOnly:
		"Seuls les propriétaires et les admins peuvent modifier ce réglage.",
	general: {
		title: "Général",
		description:
			"Le nom du projet, affiché dans la barre latérale et dans les données des webhooks.",
		name: "Nom",
	},
	install: {
		title: "Installer le widget",
		description1:
			"Ajoute un bouton à votre app. Vos utilisateurs signalent un bug avec une capture d'écran annotée, ou suggèrent une idée.",
		description2:
			"Les étapes avant le signalement, les erreurs de la console, les requêtes en échec et l'appareil sont joints automatiquement.",
		platform: "Plateforme",
		tabWeb: "Site web",
		tabApi: "Apps mobiles et autres (API)",
		releaseBefore: "Renseignez",
		releaseAfter:
			"avec la version de votre app à chaque déploiement : les tickets indiquent les versions où ils ont été vus, et un bug terminé qui est signalé de nouveau est rouvert comme régression.",
		identify: "Puis identifiez l'utilisateur connecté",
		identifyComment:
			"Après la connexion, pour que chaque signalement indique qui l'a envoyé :",
		apiBefore:
			"Swift, Kotlin, Flutter, React Native ou un backend : envoyez les signalements en une requête JSON. La",
		apiLink: "référence de l'API d'ingestion",
		apiAfter: "détaille chaque champ.",
	},
	origins: {
		title: "Sites autorisés",
		anySite:
			"N'importe quel site peut envoyer des signalements avec cette clé. Très bien pendant les tests ; ajoutez l'adresse de votre app avant la mise en ligne.",
		onlyThese:
			"Seuls ces sites peuvent envoyer des signalements avec cette clé.",
		mobile:
			"Les apps mobiles ne sont pas concernées : elles n'envoient pas d'adresse de site.",
		label: "Une adresse par ligne",
		save: "Enregistrer les sites",
	},
	identity: {
		title: "Identité vérifiée",
		description1:
			"Les utilisateurs suivent leurs signalements et échangent avec vous depuis le widget. Par défaut, chaque appareil voit les signalements envoyés depuis cet appareil.",
		description2:
			"Activez cette option pour qu'un utilisateur connecté retrouve tous ses signalements, sur tous ses appareils : votre serveur signe son identifiant avec ce secret, et le widget transmet la signature. Un identifiant sans signature valide n'ouvre jamais les signalements de personne.",
		description3:
			"Tant que l'option est active, un signalement envoyé par un utilisateur vérifié n'appartient qu'à lui : l'appareil d'où il vient ne l'affiche plus de lui-même. Remplacer le secret invalide toutes les signatures faites avec l'ancien : tant que votre serveur ne signe pas avec le nouveau, les utilisateurs connectés ne voient que ce que leur appareil a envoyé sans connexion. Désactiver l'option rend à chaque appareil tous les signalements envoyés depuis celui-ci, vérifiés ou non.",
		secret: "Secret d'identité : gardez-le sur votre serveur",
		server: "Sur votre serveur, pour l'utilisateur connecté (Node)",
		serverComment:
			"Envoyez-le à la page avec les autres données de l'utilisateur connecté.",
		otherLanguage:
			"Dans un autre langage : le HMAC-SHA256 de l'identifiant de l'utilisateur avec ce secret, en hexadécimal. En PHP,",
		client: "Puis dans votre app, avec le même identifiant",
		replaced:
			"Nouveau secret. Mettez à jour votre serveur : les signatures faites avec l'ancien ne fonctionnent plus et, d'ici là, les utilisateurs connectés ne voient que ce que leur appareil a envoyé sans connexion.",
		replace: "Remplacer le secret",
		turnedOff:
			"L'identité vérifiée est désactivée. Chaque appareil voit tous les signalements envoyés depuis celui-ci, vérifiés ou non.",
		turnOff: "Désactiver",
		turnedOn:
			"L'identité vérifiée est activée. Ajoutez la signature sur votre serveur.",
		turnOn: "Activer l'identité vérifiée",
		state: (on) =>
			`L'identité vérifiée est ${on ? "activée" : "désactivée"}. Seuls les propriétaires et les admins peuvent voir le secret ou modifier ce réglage.`,
	},
	chat: {
		title: "Discord et Slack",
		description1:
			"Publie dans un salon les nouveaux signalements, les changements de statut et de personne assignée, et les commentaires.",
		description2:
			"Discord : paramètres du salon → Intégrations → Webhooks → Nouveau webhook → Copier l'URL. Slack : une URL d'Incoming Webhook.",
		testSent: "Message de test envoyé",
		testFailed: (error) => `Échec du test : ${error}`,
		sendTest: "Envoyer un test",
		remove: "Retirer ce salon",
		removed: "Salon retiré",
		ownersOnly:
			"Seuls les propriétaires et les admins peuvent ajouter ou retirer des salons.",
		added: (service) => `Salon ${service} ajouté`,
		addFailed: "Impossible d'ajouter le salon",
		url: "URL du webhook",
		add: "Ajouter le salon",
		language: "Langue",
		languageHelp:
			"Les messages Discord et Slack de ce projet sont rédigés dans cette langue.",
	},
	webhooks: {
		title: "Webhooks",
		description1:
			"Nous envoyons chaque événement en JSON (POST) à votre agent ou à votre serveur, avec 5 nouvelles tentatives en cas d'échec.",
		checkBefore: "Vérifiez l'en-tête",
		checkMiddle: ": un HMAC-SHA256 de",
		checkAfter: "avec le secret.",
		eventHelp: {
			"report.created":
				"Un utilisateur a envoyé un signalement depuis le widget",
			"issue.created":
				"Un ticket a été ouvert, depuis un signalement ou à la main",
			"issue.updated":
				"Le statut, la priorité, les étiquettes, la personne assignée ou la PR ont changé",
			"comment.created": "Quelqu'un, ou un agent, a commenté",
			"message.created":
				"Un auteur de signalement a écrit à l'équipe, ou l'équipe lui a répondu",
		},
		pingDelivered: (status) => `Ping reçu (HTTP ${status})`,
		pingFailed: (error) => `Échec du ping : ${error}`,
		delete: "Supprimer ce webhook",
		deleted: "Webhook supprimé",
		everyEvent: "Tous les événements",
		signingSecret: "Secret de signature",
		ownersOnly:
			"Seuls les propriétaires et les admins peuvent ajouter ou supprimer un webhook, ou voir son secret.",
		added: "Webhook ajouté",
		addFailed: "Impossible d'ajouter le webhook",
		endpoint: "Ajouter une adresse",
		events: "Événements, ou aucun pour tous les recevoir",
		add: "Ajouter le webhook",
		recent: "Envois récents",
		event: "Événement",
		result: "Résultat",
		tries: "Tentatives",
		when: "Date",
		delivered: "Reçu",
		failed: "Échec",
		retrying: "Nouvelle tentative",
	},
	github: {
		title: "GitHub",
		description1:
			"Passe un ticket à Terminé quand sa pull request est fusionnée dans la branche par défaut du dépôt : personne n'a à le faire à la main. Les auteurs d'une demande livrée reçoivent leur e-mail comme d'habitude.",
		linkedBefore:
			"Une pull request est liée quand c'est la PR du ticket (les agents la renseignent avec",
		linkedMiddle: "), ou quand son titre ou sa description contient",
		linkedOr: "(ou",
		linkedAfter:
			" : fix, close ou resolve sous n'importe quelle forme, juste avant la référence ; une simple mention ne lie rien, et un #12 seul désigne une issue de GitHub). Ouvrir une telle pull request la lie et fait passer le ticket de À faire ou En cours à En revue. Un ticket lié à une autre pull request n'est pas modifié.",
		turnedOn: "Synchronisation GitHub activée",
		turnedOff: "Synchronisation GitHub désactivée",
		toggle:
			"Passer les tickets à Terminé quand leur pull request est fusionnée",
		step1: "Dans votre dépôt sur GitHub :",
		step1Path: "Settings → Webhooks → Add webhook",
		payloadUrl: "Payload URL",
		step2: " : l'adresse ci-dessous.",
		contentType: "Content type",
		colon: " :",
		secret: "Secret",
		step4: " : le secret ci-dessous.",
		selectEvents: "Let me select individual events",
		step5Check: ", cochez seulement",
		pullRequests: "Pull requests",
		step5Then: "puis",
		addWebhook: "Add webhook",
		step5Ping: ". GitHub envoie aussitôt un ping.",
		newSecretCreated: "Nouveau secret créé : collez-le dans GitHub",
		newSecret: "Nouveau secret",
		oldStops: "L'ancien cesse aussitôt de fonctionner.",
		lastDelivery: "Dernier envoi",
	},
	portal: {
		title: "Demandes publiques",
		description:
			"Une page publique où chacun peut voir ce que vous prévoyez, voter pour des idées et en proposer de nouvelles. Seules les demandes que vous avez acceptées depuis le Triage y figurent.",
		publish: "Publier la page",
		address: "Adresse",
		open: "Ouvrir la page publique",
	},
	danger: {
		title: "Supprimer ce projet",
		description:
			"Supprime tous les tickets, signalements, captures d'écran, webhooks et votes de ce projet. Le widget n'accepte plus de signalements. Cette action est irréversible.",
		deleted: (name) => `${name} a été supprimé`,
		typeBefore: "Saisissez",
		typeAfter: "pour confirmer",
		delete: (name) => `Supprimer ${name}`,
	},
};
