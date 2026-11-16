"use client";

import { useState } from "react";
import { DOCS } from "./brand";

/** Where Tattle plugs in: one tab per kind of app, each line a real snippet. */

type Line = { code: string; title: string; note: string };
type Platform = {
	id: string;
	tab: string;
	sub: string;
	lines: Line[];
	doc: string;
};

const PLATFORMS: Platform[] = [
	{
		id: "web",
		tab: "Web",
		sub: "Toute page HTML",
		doc: DOCS.widget,
		lines: [
			{
				code: '<script src="https://bugs.lune.example/widget.js" data-project-key="pk_…" defer></script>',
				title: "Ajoutez la balise",
				note: "Le bouton apparaît en bas à droite, aux couleurs que vous choisissez.",
			},
			{
				code: "Tattle.identify({ id: user.id, email: user.email, name: user.name })",
				title: "Dites qui est connecté",
				note: "Le compte et ses traits, comme l'offre, arrivent avec chaque rapport.",
			},
			{
				code: 'data-release="1.4.2"',
				title: "Donnez la version",
				note: "Les issues se filtrent par version et un bug qui revient est signalé.",
			},
			{
				code: "Tattle.identify({ id, email, name, hash })",
				title: "Vérifiez l'identité",
				note: "Signée sur votre serveur, elle montre à chacun ses rapports sur tous ses appareils.",
			},
		],
	},
	{
		id: "rn",
		tab: "React Native",
		sub: "Et Expo",
		doc: DOCS.reactNative,
		lines: [
			{
				code: '<TattleProvider projectKey="pk_…" apiUrl="https://bugs.lune.example">',
				title: "Enveloppez l'app",
				note: "Même bouton, même formulaire, capture annotée de l'écran en cours.",
			},
			{
				code: "Tattle.trackNavigation(navigationRef)",
				title: "Suivez les écrans",
				note: "Les écrans visités avant le rapport deviennent ses étapes.",
			},
			{
				code: "Tattle.identify({ id: user.id, email: user.email })",
				title: "Dites qui est connecté",
				note: "La version et le build de l'app sont envoyés sans réglage.",
			},
		],
	},
	{
		id: "api",
		tab: "Autres",
		sub: "Swift, Kotlin, Flutter",
		doc: DOCS.ingest,
		lines: [
			{
				code: "POST /api/v1/ingest",
				title: "Une requête JSON",
				note: "Message, capture, étapes, logs, appareil : chaque champ est documenté.",
			},
			{
				code: "GET /api/v1/my-reports",
				title: "Le suivi dans votre interface",
				note: "Vos utilisateurs lisent les statuts et les réponses de l'équipe là où vous voulez.",
			},
		],
	},
	{
		id: "mcp",
		tab: "Agents",
		sub: "MCP, OAuth ou jeton",
		doc: DOCS.mcp,
		lines: [
			{
				code: "claude mcp add --transport http tattle https://bugs.lune.example/api/mcp",
				title: "Branchez votre client MCP",
				note: "Claude Code, Cursor… se connectent par OAuth et agissent en votre nom.",
			},
			{
				code: '--header "Authorization: Bearer tat_…"',
				title: "Ou donnez un jeton à un bot",
				note: "Il agit sous son propre nom, en lecture seule si vous voulez.",
			},
			{
				code: "list_issues · get_report · mark_duplicate",
				title: "Il lit, trie, fusionne",
				note: "Le rapport complet, capture comprise, et les doublons à rattacher.",
			},
			{
				code: "update_issue · reply_to_reporter",
				title: "Il corrige et répond",
				note: "Il lie sa pull request et écrit à la personne qui a signalé.",
			},
		],
	},
];

export function Install() {
	const [active, setActive] = useState(0);
	const p = PLATFORMS[active];
	return (
		<section
			className="in"
			id="installer"
			aria-labelledby="in-title"
			data-step-section="Installer"
		>
			<div className="in-top" data-reveal>
				<h2 id="in-title" data-reveal-item>
					<span className="in-soft">Une minute à brancher,</span>{" "}
					<span>là où tourne votre app</span>
				</h2>
				<a className="btn btn-ink" href={p.doc} data-reveal-item>
					Lire la doc {p.tab}
				</a>
			</div>
			<div className="in-body">
				<div className="in-tabs" role="tablist" aria-label="Plateforme">
					{PLATFORMS.map((pl, i) => (
						<button
							key={pl.id}
							type="button"
							role="tab"
							id={`tab-${pl.id}`}
							aria-selected={i === active}
							aria-controls={`panel-${pl.id}`}
							onClick={() => setActive(i)}
							onKeyDown={(e) => {
								if (e.key === "ArrowDown" || e.key === "ArrowRight")
									setActive((active + 1) % PLATFORMS.length);
								if (e.key === "ArrowUp" || e.key === "ArrowLeft")
									setActive((active - 1 + PLATFORMS.length) % PLATFORMS.length);
							}}
						>
							<strong>{pl.tab}</strong>
							<span>{pl.sub}</span>
						</button>
					))}
				</div>
				<ul
					className="in-bands"
					role="tabpanel"
					id={`panel-${p.id}`}
					aria-labelledby={`tab-${p.id}`}
					key={p.id}
				>
					{p.lines.map((l) => (
						<li key={l.code}>
							<code>{l.code}</code>
							<span className="in-what">
								<strong>{l.title}</strong>
								<span>{l.note}</span>
							</span>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
