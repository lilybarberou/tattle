import { pluralizer } from "../../format";
import type { workspace as en } from "../en/workspace";

const p = pluralizer("fr");

export const workspace: typeof en = {
	members: {
		title: "Membres",
		description: (count, organization) =>
			`${p(count, { one: "# personne", other: "# personnes" })} dans ${organization}. Les inscriptions sont fermées : on rejoint l'espace sur invitation.`,
		peopleTitle: "Personnes",
		peopleDescription:
			"Chaque membre voit tous les projets, trie les signalements et peut créer des jetons d'API pour des agents.",
		inviteTitle: "Inviter quelqu'un",
		inviteDescription:
			"L'invitation est envoyée par e-mail quand SMTP est configuré sur ce serveur ; le lien fonctionne aussi. Il est valable 7 jours : la personne crée son compte avec cette adresse e-mail et rejoint l'espace aussitôt.",
		invitationEmailed: "Invitation envoyée par e-mail",
		invitationFailed: "L'invitation a échoué",
		email: "E-mail",
		emailPlaceholder: "camille@atelier-nord.fr",
		role: "Rôle",
		createInvitation: "Créer l'invitation",
		onlyAdminsInvite:
			"Seuls les propriétaires et les admins peuvent inviter des personnes.",
		invitationLink: (email) =>
			`Lien d'invitation pour ${email} (utile aussi si l'e-mail se perd)`,
		waiting: "En attente",
		expires: "expire",
		linkUnavailable: "Lien indisponible",
		showLink: "Afficher le lien",
		invitationCanceled: "Invitation annulée",
		cancel: "Annuler",
	},
	agents: {
		title: "Agents et API",
		description: (organization) =>
			`Les jetons valent pour tous les projets de ${organization}. Un agent agit sous le nom de son jeton.`,
		agentsTitle: "Agents",
		agentsDescription:
			"Chaque jeton est un agent à qui vous pouvez assigner des tickets. Lui en assigner un lui envoie un webhook issue.updated.",
		noAgent:
			"Aucun agent pour l'instant. Créez un jeton ci-dessous pour en connecter un.",
		readsAndChanges: "Lit et modifie les tickets",
		readOnly: "Lecture seule",
		active: "actif",
		neverUsed: "jamais utilisé",
		revoked: (name) => `${name} ne peut plus se connecter`,
		notRevoked: "Non révoqué",
		revoke: "Révoquer",
		createFailed: "Impossible de créer le jeton",
		newAgent: "Nouvel agent",
		namePlaceholder: "Robot de triage",
		canWrite: "Peut modifier les tickets (sinon, lecture seule)",
		createToken: "Créer le jeton",
		copyNow: "Copiez ce jeton maintenant. Il ne s'affiche qu'une fois.",
		oauthTitle: "Connecter votre propre client MCP",
		oauthDescription:
			"Claude Code, Cursor et les autres clients MCP vous connectent depuis le navigateur : aucun jeton à copier. Ils agissent en votre nom.",
		noApp: "Aucune application connectée à votre compte pour l'instant.",
		app: "Application",
		unnamedApp: "Application sans nom",
		connected: "Connectée",
		disconnected: (name) => `${name ?? "L'application"} a été déconnectée`,
		disconnect: "Déconnecter",
		tokenTitle: "Connecter un agent avec un jeton",
		tokenDescription:
			"Pour les robots et les scripts qui tournent sans navigateur. Collez l'un de ces blocs là où l'agent lit ses serveurs MCP.",
		anyClient: "Tout client MCP",
		duplicatesTitle: "Suggestions de doublons",
		duplicatesIntro:
			"Chaque nouveau signalement est comparé aux tickets les plus proches du projet. Sans IA, seule une formulation quasi identique est suggérée.",
		duplicatesDetail:
			"Avec votre propre clé, le modèle juge s'ils décrivent le même problème. Il reçoit le message du signalement, l'URL de la page et les erreurs de la console, ainsi que le titre et la description de 8 tickets proches au plus. Rien n'est envoyé tant que c'est désactivé.",
		toolsTitle: "Ce qu'un agent peut faire",
		toolsDescription:
			"Le texte des signalements est écrit par vos utilisateurs. Le serveur demande aux agents de le traiter comme des données, jamais comme des instructions.",
		tools: {
			list_issues: "La file du Triage et toutes les autres vues",
			search_issues: "Trouver les tickets proches avant de fusionner",
			get_issue:
				"Un ticket avec ses commentaires, son activité et sa suggestion de doublon",
			get_report: "Logs, appareil, compte et la capture d'écran en image",
			update_issue:
				"Statut, priorité, étiquettes, personne assignée, pull request",
			mark_duplicate: "Fusionner dans l'original, signalements compris",
			add_comment: "Expliquer une décision sur le ticket",
			create_issue: "Ouvrir un ticket qu'il a trouvé lui-même",
		},
	},
	ai: {
		openaiCompatible: "Compatible OpenAI",
		on: (provider, model) => `Activé : ${provider}, ${model}. `,
		off: "Désactivé : seules les formulations quasi identiques sont suggérées. ",
		onlyAdmins: "Seuls les propriétaires et les admins peuvent le modifier.",
		usesYourAi: "Les suggestions de doublons utilisent votre IA",
		settingsSaved: "Paramètres enregistrés",
		judge: "Juger les doublons avec l'IA",
		provider: "Fournisseur",
		baseUrl: "URL de base",
		baseUrlBefore: "L'adresse avant",
		baseUrlHelp:
			", par exemple https://openrouter.ai/api/v1. Les adresses sur la machine du serveur ou sur son réseau privé, comme http://localhost:11434/v1 pour Ollama, demandent",
		baseUrlAfter: "sur le serveur.",
		model: "Modèle",
		apiKey: "Clé d'API",
		savedKey: (last4) => `Enregistrée : ••••${last4}`,
		pasteKey: "Collez la clé",
		keyHelp: {
			anthropic: "Sur console.anthropic.com → API keys.",
			openai: "Sur platform.openai.com → API keys.",
			openai_compatible:
				"Mistral, OpenRouter, Ollama, LM Studio… Laissez la clé vide si le serveur n'en demande pas.",
		},
		storedEncrypted:
			"Elle est stockée chiffrée et ne sera plus jamais affichée.",
		keepSavedKey: " Laissez le champ vide pour garder la clé enregistrée.",
		keyUnreadable:
			"La clé enregistrée ne peut plus être lue : le secret du serveur a changé. Collez-la de nouveau.",
		testFailed: "Le test a échoué",
		testing: "Test en cours…",
		test: "Tester",
		removed: "Paramètres d'IA et clé supprimés",
		notRemoved: "Non supprimé",
		removeKey: "Supprimer la clé",
		answered: (model) => `${model} a répondu.`,
	},
	privacy: {
		title: "Confidentialité",
		description:
			"Retrouvez, exportez ou effacez ce que le widget a collecté sur une personne, et choisissez combien de temps les signalements gardent leurs captures et leurs logs.",
		personTitle: "Les données d'une personne",
		personDescription:
			"Pour une demande d'accès ou d'effacement (RGPD). Cherchez par l'e-mail ou l'identifiant utilisateur que votre app transmet au widget. Couvre tous les projets de cet espace de travail.",
		exportFailed: "L'export a échoué",
		searchFailed: "La recherche a échoué",
		query: "E-mail ou identifiant utilisateur",
		queryPlaceholder: "lea.martin@gmail.com",
		find: "Rechercher",
		nothingStored: (query) => `Rien n'est enregistré pour « ${query} ».`,
		reports: (count) => p(count, { one: "signalement", other: "signalements" }),
		inProjects: (projects) => ` dans ${projects}`,
		votes: (count) => p(count, { one: "vote", other: "votes" }),
		onPublicPages: " sur les pages publiques.",
		onlyAdmins:
			"Seuls les propriétaires et les admins peuvent exporter ou effacer les données d'une personne.",
		download: "Télécharger en JSON",
		erase: "Effacer…",
		erased: (r) =>
			`${p(r.reports, { one: "# signalement effacé", other: "# signalements effacés" })}, ${p(r.messages, { one: "# message", other: "# messages" })} et ${p(r.votes, { one: "# vote", other: "# votes" })} ; ${p(r.issues, { one: "# ticket ouvert par cette personne supprimé", other: "# tickets ouverts par cette personne supprimés" })}`,
		notErased: "Non effacé",
		eraseForGood: (count) =>
			p(count, {
				one: "Effacer définitivement # élément",
				other: "Effacer définitivement # éléments",
			}),
		keep: "Les garder",
		eraseExplained:
			"Ses signalements, captures d'écran et votes sont supprimés. Un ticket que cette personne est seule à avoir signalé est supprimé aussi, car son titre reprend ses mots ; les tickets signalés aussi par d'autres restent.",
		retentionTitle: "Durée de conservation des signalements",
		retentionSet: "Définissez",
		retentionDescription:
			"sur le serveur pour supprimer les captures et les logs des anciens signalements. Le message et son auteur restent, pour que les tickets gardent leur historique.",
		retentionDays: (days) =>
			`Les captures d'écran et les logs de console et de réseau sont supprimés ${days} jours après l'arrivée d'un signalement.`,
		retentionNone:
			"Les signalements gardent leurs captures et leurs logs jusqu'à ce que vous les supprimiez.",
		collectedTitle: "Ce que le widget collecte",
		collectedDescription:
			"Utile pour votre politique de confidentialité : indiquez-le sous l'outil que vous utilisez pour les signalements de bugs.",
		collected: {
			account: {
				term: "Compte",
				text: "Ce que votre app transmet à identify() : identifiant, e-mail, nom et autres attributs.",
			},
			message: {
				term: "Message et capture",
				text: "Ce que la personne a écrit, et la capture d'écran annotée si elle en a pris une. Les champs de mot de passe et de carte sont masqués.",
			},
			console: {
				term: "Console",
				text: "Les 200 derniers messages de la console et les erreurs JavaScript de la page.",
			},
			network: {
				term: "Réseau",
				text: "Les 100 dernières requêtes : méthode, URL, statut, durée. Ni corps ni en-têtes ; les jetons dans les URL sont masqués.",
			},
			device: {
				term: "Appareil",
				text: "Navigateur, système, taille de l'écran et de la fenêtre, langue, fuseau horaire.",
			},
			votes: {
				term: "Votes sur le portail",
				text: "Un identifiant aléatoire dans un cookie, et un e-mail seulement si le visiteur en laisse un.",
			},
		},
	},
	notifications: {
		title: "Notifications",
		description: (email) =>
			`Des e-mails à ${email} pour ce qui demande votre action. Discord, Slack et les webhooks couvrent tout le reste.`,
		noSmtp:
			"Ce serveur n'a pas de paramètres SMTP : aucun e-mail n'est envoyé. Vos choix sont gardés pour le jour où il en aura.",
		sentAround: (hour) => `Envoyé vers ${hour}.`,
		workTitle: "Votre travail",
		workDescription:
			"Jamais pour ce que vous avez fait vous-même. Chaque e-mail contient aussi un lien pour arrêter ce type d'e-mail.",
		digestTitle: "Résumé",
		digestDescription:
			"Un e-mail par jour au plus, seulement quand du nouveau attend dans le Triage.",
		healthTitle: "Santé de l'espace de travail",
		healthDescription:
			"Pour les propriétaires et les admins : quand un élément configuré pour l'espace de travail cesse de fonctionner.",
	},
};
