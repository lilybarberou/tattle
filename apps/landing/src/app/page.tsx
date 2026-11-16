import { BrandMark, DOCS, REPO } from "@/components/brand";
import { Deploy } from "@/components/deploy";
import { Install } from "@/components/install";
import { LiveReport } from "@/components/live-report";
import { Promo } from "@/components/promo";
import { Showcase } from "@/components/showcase";
import { Stages } from "@/components/stages";

const FAQ = [
	{
		q: "Est-ce que quelque chose quitte mon serveur ?",
		a: "Non, par défaut. Les rapports, les captures et les comptes restent dans votre Postgres et votre stockage (disque ou S3). Seule exception, si vous l'activez : la détection de doublons par IA envoie au fournisseur de votre choix le message, l'adresse de la page, le type et au plus cinq erreurs console, jamais la capture, le rapporteur ni l'appareil.",
	},
	{
		q: "Faut-il une clé d'IA ?",
		a: "Non. Sans clé, Tattle repère les doublons formulés presque à l'identique avec la recherche plein texte de Postgres. Avec votre clé Anthropic, OpenAI ou un serveur compatible comme Ollama, un modèle juge si deux rapports décrivent le même problème. Rien n'est fusionné sans un clic.",
	},
	{
		q: "Qu'est-ce que le widget collecte ?",
		a: "Le message, la capture annotée si l'utilisateur en joint une, les pages, clics et champs modifiés avant le rapport, les logs console, les erreurs JavaScript, les requêtes réseau, l'appareil, la version de votre app et le compte que vous avez identifié. Les valeurs des champs sensibles sont masquées.",
	},
	{
		q: "Un agent peut-il faire n'importe quoi ?",
		a: "Il fait ce que son accès permet. Un client MCP en OAuth agit en votre nom ; un jeton agit sous son propre nom et peut être en lecture seule. Le contenu écrit par vos utilisateurs est marqué comme non fiable, pour que l'agent le lise comme une donnée et jamais comme une consigne.",
	},
	{
		q: "Et les apps mobiles ?",
		a: "Le SDK React Native et Expo ajoute le même bouton avec la capture de l'écran, les écrans visités, les erreurs et le réseau. Pour Swift, Kotlin, Flutter ou le reste, une seule requête JSON suffit : l'API d'ingestion documente chaque champ.",
	},
	{
		q: "Comment répondre à une demande RGPD ?",
		a: "La page Confidentialité retrouve tout ce qui concerne une personne par e-mail ou identifiant, l'exporte en JSON avec ses conversations, et l'efface. Une durée de rétention supprime d'elle-même les captures, les logs et les étapes des anciens rapports.",
	},
	{
		q: "De quoi le serveur a-t-il besoin ?",
		a: "Docker et 1 Go de RAM, sur Intel, AMD ou ARM. L'image embarque l'app ; Postgres tourne à côté, et Caddy en option pour le HTTPS automatique. Le SMTP et le stockage S3 sont facultatifs. Fonctionne aussi sur EasyPanel, Coolify ou Dokploy.",
	},
	{
		q: "Quelqu'un peut-il inonder mon projet de faux rapports ?",
		a: "La clé publique du widget est visible dans votre app, donc l'envoi est limité par adresse IP (20 rapports par 10 minutes) et par projet (300 par heure), deux réglages que vous pouvez changer. Derrière un proxy, Tattle lit la vraie adresse sans se laisser tromper par un en-tête forgé.",
	},
	{
		q: "Et les mises à jour ?",
		a: "docker compose pull puis docker compose up -d. Au démarrage, l'app vérifie sa configuration, attend Postgres et applique les migrations. Pour rester sur une version, fixez TATTLE_VERSION.",
	},
];

function Arrow() {
	return (
		<svg
			viewBox="0 0 48 48"
			width="48"
			height="48"
			aria-hidden="true"
			className="arrow"
		>
			<path
				d="M10 38L38 10M16 10h22v22"
				fill="none"
				stroke="currentColor"
				strokeWidth="4"
			/>
		</svg>
	);
}

export default function Home() {
	return (
		<main>
			{/* Hero: what Tattle is, and the report it would file from this visit. */}
			<section className="hero" data-step-section="Accueil">
				<div className="hero-left">
					<a href="/" className="logo" aria-label="Tattle, accueil">
						<BrandMark size={24} />
						<span>Tattle</span>
					</a>
					<div className="hero-copy">
						<h1 className="masked">
							<span className="line">
								<span>Bugs et idées,</span>
							</span>{" "}
							<span className="line">
								<span>signalés depuis vos apps.</span>
							</span>
						</h1>
						<p className="hero-sub">
							Tattle est un widget et un tracker que vous hébergez. Chaque
							rapport arrive avec sa capture annotée, les étapes, la console, le
							réseau et l'appareil, prêt à être trié par votre équipe ou par un
							agent IA.
						</p>
						<a className="btn btn-light hero-cta" href="#deployer">
							Installer avec Docker
						</a>
					</div>
				</div>
				<div className="hero-right">
					<a className="hero-link" href={REPO}>
						GitHub
					</a>
					<div className="hero-fragment">
						<LiveReport />
						<p className="hero-caption">
							Ce rapport est celui de votre visite, en direct. Cliquez, défilez,
							provoquez une erreur : rien n'est envoyé.
						</p>
					</div>
				</div>
			</section>

			{/* The promo film: the whole loop in 44 seconds. */}
			<section
				className="pr"
				aria-labelledby="pr-title"
				data-step-section="La vidéo"
				data-reveal
			>
				<div className="pr-copy">
					<h2 id="pr-title" data-reveal-item>
						Signalé. Compris. Corrigé.
					</h2>
					<p data-reveal-item>
						Marie ne peut pas payer son panier sur la boutique Lune. Elle le
						signale en deux clics ; l'équipe reçoit le rapport avec tout son
						contexte, le trie au clavier, et la pull request qui corrige le bug
						la prévient.
					</p>
				</div>
				<Promo />
			</section>

			<Showcase />

			<Stages />

			{/* Everything that happens after the report. */}
			<section
				className="fx"
				aria-labelledby="fx-title"
				data-step-section="Fonctions"
				data-reveal
			>
				<h2 id="fx-title" data-reveal-item>
					Tout ce qui suit le rapport
				</h2>
				<div className="fx-grid">
					<article className="fx-cell" data-reveal-item>
						<div className="fx-text">
							<h3>Les doublons, repérés</h3>
							<p>
								Chaque rapport est comparé aux issues proches, corrigées
								comprises. Un clic fusionne ; un refus n'est jamais reproposé.
							</p>
						</div>
						<div className="fx-ui fx-dup" data-ui>
							<p className="ui-sub">Duplicate suggestion</p>
							<p className="fx-dup-title">
								Looks like <b>#12</b> Checkout total is wrong after removing a
								promo code
							</p>
							<p className="ui-muted">3 reports · last one 2 h ago · Done</p>
							<div className="ui-row">
								<span className="ui-btn ui-btn-primary">Merge into #12</span>
								<span className="ui-btn">Not a duplicate</span>
							</div>
						</div>
					</article>

					<article className="fx-cell fx-flip" data-reveal-item>
						<div className="fx-text">
							<h3>Les régressions, rouvertes</h3>
							<p>
								Un bug corrigé qui revient se rouvre seul, avec la version où il
								est réapparu, et la personne assignée est prévenue.
							</p>
						</div>
						<div className="fx-ui fx-reg" data-ui>
							<ol className="ui-activity">
								<li>
									<span className="ui-dot tone-done" aria-hidden="true" />
									<span>
										<b>GitHub</b> moved it to Done
									</span>
									<time>Oct 28</time>
								</li>
								<li>
									<span className="ui-dot tone-bad" aria-hidden="true" />
									<span>
										<b>Regressed in 1.4.2</b> · a newer report was attached
									</span>
									<time>Nov 14</time>
								</li>
								<li>
									<span className="ui-dot tone-triage" aria-hidden="true" />
									<span>
										<b>Tattle</b> reopened it in Todo
									</span>
									<time>Nov 14</time>
								</li>
							</ol>
							<p className="ui-sub">Seen in</p>
							<div className="ui-row">
								<span className="ui-chip">1.3.0</span>
								<span className="ui-chip">1.3.1</span>
								<span className="ui-chip ui-chip-bad">1.4.2</span>
							</div>
						</div>
					</article>

					<article className="fx-cell" data-reveal-item>
						<div className="fx-text">
							<h3>Un agent au triage</h3>
							<p>
								Par MCP, votre agent lit le rapport complet, capture comprise,
								fusionne les doublons, lie sa pull request et répond.
							</p>
						</div>
						<div className="fx-ui fx-term" data-ui>
							<pre>
								<code>
									{`● tattle · get_report r_8f2c
  ⎿ Marie Dupont · Chrome 131 · macOS 15 · 1.4.2
    14:02:15 click  « Payer 84,00 € »
    14:02:16 failed POST /api/checkout 500
    14:02:16 error  TypeError: Cannot read
                    properties of undefined
● tattle · mark_duplicate #44 → #42
  ⎿ 2 reports moved to #42
● tattle · update_issue #42
  ⎿ pr_url …/lune/shop/pull/318`}
								</code>
							</pre>
						</div>
					</article>

					<article className="fx-cell fx-flip" data-reveal-item>
						<div className="fx-text">
							<h3>Fermé par la pull request</h3>
							<p>
								« Fixes Tattle #42 » dans la PR : elle passe l'issue en revue à
								l'ouverture, en Done à la fusion, et prévient qui l'a demandée.
							</p>
						</div>
						<div className="fx-ui fx-pr" data-ui>
							<div className="ui-pr">
								<svg
									viewBox="0 0 16 16"
									width="16"
									height="16"
									aria-hidden="true"
								>
									<circle
										cx="4"
										cy="3.5"
										r="1.8"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.4"
									/>
									<circle
										cx="4"
										cy="12.5"
										r="1.8"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.4"
									/>
									<circle
										cx="12"
										cy="12.5"
										r="1.8"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.4"
									/>
									<path
										d="M4 5.3v5.4M4 5.5c0 3 8 2 8 5.2"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.4"
									/>
								</svg>
								<span>
									<b>Fix checkout total when a promo code is removed</b>
									<small>lune/shop #318 · Fixes Tattle #42</small>
								</span>
								<em>Merged</em>
							</div>
							<div className="ui-pr ui-pr-issue">
								<span className="ui-dot tone-done" aria-hidden="true" />
								<span>
									<b>#42 Le paiement échoue…</b>
									<small>GitHub moved it to Done · 2 people told</small>
								</span>
								<em className="ui-done">Done</em>
							</div>
						</div>
					</article>

					<article className="fx-cell" data-reveal-item>
						<div className="fx-text">
							<h3>Dans Discord et Slack</h3>
							<p>
								Les nouveaux rapports et leurs preuves arrivent dans votre
								canal. Des webhooks signés, relancés en cas d'échec, pour le
								reste.
							</p>
						</div>
						<div className="fx-ui fx-chat" data-ui>
							<p className="ui-sub"># bugs-lune</p>
							<div className="ui-chatmsg">
								<span className="ui-avatar" aria-hidden="true">
									<BrandMark size={18} hole="#fff" />
								</span>
								<span>
									<b>Tattle</b> <small>14:02</small>
									<span className="ui-embed">
										<b>
											New bug · Le paiement échoue quand je clique sur « Payer »
										</b>
										<span>1 error · 1 failed request · Chrome 131 · 1.4.2</span>
										<span>Reported by Marie Dupont on /panier</span>
									</span>
								</span>
							</div>
						</div>
					</article>

					<article className="fx-cell fx-flip" data-reveal-item>
						<div className="fx-text">
							<h3>Le RGPD, en deux boutons</h3>
							<p>
								Retrouvez tout ce qui concerne une personne, exportez-le en JSON
								ou effacez-le. Les vieilles captures partent d'elles-mêmes.
							</p>
						</div>
						<div className="fx-ui fx-privacy" data-ui>
							<p className="ui-sub">Privacy</p>
							<p className="ui-search">marie@lune.example</p>
							<dl className="ui-props">
								<dt>Reports</dt>
								<dd>3</dd>
								<dt>Conversations</dt>
								<dd>2</dd>
								<dt>Votes</dt>
								<dd>1</dd>
							</dl>
							<div className="ui-row">
								<span className="ui-btn">Export JSON</span>
								<span className="ui-btn ui-btn-danger">Erase</span>
							</div>
						</div>
					</article>
				</div>
			</section>

			<Install />

			{/* Pricing: there is one plan, and it is yours. */}
			<section
				className="pz"
				aria-labelledby="pz-title"
				data-step-section="Prix"
				data-reveal
			>
				<div className="pz-copy">
					<h2 id="pz-title" data-reveal-item>
						Gratuit, chez vous
					</h2>
					<p data-reveal-item>
						Tattle est open source. Vous l'hébergez : pas de siège à payer, pas
						de quota de rapports, et vos données ne vont nulle part ailleurs.
					</p>
				</div>
				<div className="pz-figure" data-reveal-item>
					<p className="pz-price">
						<span className="pz-num">0</span>
						<span className="pz-cur">€</span>
						<span className="pz-per">par mois, quelle que soit l'équipe</span>
					</p>
					<div className="pz-chip" data-ui>
						<span className="ui-sub">Image</span>
						<code>ghcr.io/lilybarberou/tattle</code>
						<span className="ui-muted">latest · amd64 · arm64</span>
					</div>
					<ul className="pz-list">
						<li>Toutes les fonctions, sans limite de rapports ni de membres</li>
						<li>Le serveur sous AGPL-3.0, les widgets sous MIT</li>
						<li>Un serveur avec 1 Go de RAM suffit</li>
						<li>Mises à jour en une commande, migrations comprises</li>
					</ul>
					<a className="btn btn-accent" href={REPO}>
						Voir le code sur GitHub
					</a>
				</div>
			</section>

			<section
				className="faq"
				aria-labelledby="faq-title"
				data-step-section="Questions"
			>
				<h2 id="faq-title">Vos questions</h2>
				<div className="faq-list">
					{FAQ.map((f, i) => (
						<details key={f.q} name="faq" open={i === 0}>
							<summary>
								{f.q}
								<span className="plus" aria-hidden="true">
									<span />
									<span />
								</span>
							</summary>
							<p>{f.a}</p>
						</details>
					))}
				</div>
			</section>

			<Deploy />

			<footer className="ft" data-step-section="Pied de page">
				<h2 id="ft-title" className="sr-only">
					À propos de Tattle
				</h2>
				<div className="ft-tile ft-statement">
					<p>
						Tattle est open source : le serveur sous AGPL-3.0, les widgets sous
						MIT.
					</p>
					<small>© 2026 Tattle</small>
				</div>
				<nav className="ft-tile ft-nav" aria-label="Documentation">
					<ul>
						<li>
							<a href={DOCS.selfHosting}>Auto-hébergement</a>
						</li>
						<li>
							<a href={DOCS.widget}>Widget web</a>
						</li>
						<li>
							<a href={DOCS.reactNative}>React Native</a>
						</li>
						<li>
							<a href={DOCS.ingest}>API d'ingestion</a>
						</li>
						<li>
							<a href={DOCS.releases}>Versions</a>
						</li>
					</ul>
				</nav>
				<div className="ft-tile ft-image">
					<p>Une image Docker, Intel, AMD ou ARM</p>
					<code>ghcr.io/lilybarberou/tattle</code>
				</div>
				<div className="ft-tile ft-mail">
					<p>Un bug dans Tattle ?</p>
					<a href={DOCS.issues}>Ouvrir une issue</a>
				</div>
				<div className="ft-tile ft-word" aria-hidden="true">
					<BrandMark size={120} hole="var(--ink)" />
					<span>Tattle</span>
				</div>
				<a className="ft-tile ft-star" href={REPO}>
					<span>Une étoile sur GitHub</span>
					<Arrow />
				</a>
			</footer>
		</main>
	);
}
