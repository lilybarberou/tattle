"use client";

import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

/**
 * The widget, as the people who report see it: a row of true-size panels in
 * the widget's light theme. The centred one is lit and live; the text beside
 * it changes with it. Swipe, drag, scroll sideways or use the arrows.
 */

const Close = () => (
	<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
		<path
			d="M4 4l8 8M12 4l-8 8"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
		/>
	</svg>
);

function WidgetHead({ title, back }: { title: string; back?: boolean }) {
	return (
		<div className="w-head">
			{back && (
				<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
					<path
						d="M10 3L5 8l5 5"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
						strokeLinecap="round"
					/>
				</svg>
			)}
			<strong>{title}</strong>
			<Close />
		</div>
	);
}

const TOOLS = [
	{ name: "Rectangle", d: "M3 4h10v8H3z" },
	{ name: "Cercle", d: "M8 3.5a5 4.5 0 1 0 0.01 0z" },
	{ name: "Flèche", d: "M3 13L13 3M7 3h6v6" },
	{ name: "Crayon", d: "M3 13l1-3 7-7 2 2-7 7z" },
	{ name: "Flouter", d: "M3 3h4v4H3zM9 9h4v4H9zM9 3h4v4H9zM3 9h4v4H3z" },
];

type Panel = { id: string; name: string; text: string; ui: ReactNode };

const PANELS: Panel[] = [
	{
		id: "form",
		name: "Deux clics, sans quitter l'app",
		text: "Le bouton tient dans une balise <script> d'environ 27 Ko, isolé dans un Shadow DOM : il ne touche pas à vos styles.",
		ui: (
			<div className="w">
				<WidgetHead title="Envoyer un retour" />
				<div className="w-seg">
					<span aria-current="true">Signaler un bug</span>
					<span>Suggérer une idée</span>
				</div>
				<p className="w-label">Que s'est-il passé ?</p>
				<p className="w-area">
					Le paiement échoue quand je clique sur « Payer ». Le bouton tourne
					sans fin.
				</p>
				<div className="w-shot">
					{/* biome-ignore lint/performance/noImgElement: static export, no image optimiser */}
					<img
						src="/media/shot-annotated.jpg"
						alt="Capture annotée du panier de la boutique"
						width="784"
						height="478"
						loading="lazy"
					/>
					<span>Modifier</span>
					<span>Supprimer</span>
				</div>
				<p className="w-label">Votre e-mail (facultatif)</p>
				<p className="w-input">marie@lune.example</p>
				<span className="w-send">Envoyer</span>
			</div>
		),
	},
	{
		id: "annotate",
		name: "Entourer, flécher, flouter",
		text: "L'utilisateur montre le problème sur sa propre page et floute ce qui est privé avant l'envoi.",
		ui: (
			<div className="w w-wide">
				<div className="w-canvas">
					{/* biome-ignore lint/performance/noImgElement: static export, no image optimiser */}
					<img
						src="/media/shot-annotated.jpg"
						alt="Le panier de la boutique Lune, l'erreur de paiement entourée en rouge"
						width="784"
						height="478"
						loading="lazy"
					/>
				</div>
				<div className="w-tools">
					{TOOLS.map((t, i) => (
						<span
							key={t.name}
							className={i === 0 ? "is-on" : undefined}
							title={t.name}
						>
							<svg
								viewBox="0 0 16 16"
								width="16"
								height="16"
								aria-label={t.name}
							>
								<path
									d={t.d}
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinejoin="round"
								/>
							</svg>
						</span>
					))}
					<span className="w-tool-text">Annuler</span>
					<span className="w-tool-text w-tool-done">Terminer</span>
				</div>
			</div>
		),
	},
	{
		id: "sent",
		name: "Rien d'autre à remplir",
		text: "Les étapes, la console, le réseau, l'appareil, la version de l'app et le compte connecté partent avec le message.",
		ui: (
			<div className="w w-wide w-page">
				{/* biome-ignore lint/performance/noImgElement: static export, no image optimiser */}
				<img
					src="/media/shop-error.jpg"
					alt="La boutique Lune après l'échec du paiement, avec le bouton du widget en bas à droite"
					width="1088"
					height="660"
					loading="lazy"
				/>
				<div className="w-toast">
					<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
						<circle cx="10" cy="10" r="9" fill="var(--w-accent-soft)" />
						<path
							d="M6 10.5l2.5 2.5L14 7.5"
							fill="none"
							stroke="var(--w-accent)"
							strokeWidth="1.8"
							strokeLinecap="round"
						/>
					</svg>
					<div>
						<strong>Merci ! C'est bien reçu.</strong>
						<span>4 étapes · 1 erreur · 1 requête en échec</span>
					</div>
				</div>
			</div>
		),
	},
	{
		id: "mine",
		name: "Le suivi, dans ses mots",
		text: "Reçu, Prévu, En cours, Corrigé : chacun suit ce qu'il a envoyé depuis le widget, sans créer de compte.",
		ui: (
			<div className="w">
				<WidgetHead title="Mes signalements" back />
				<ul className="w-list">
					<li>
						<span>
							<strong>Le paiement échoue quand je clique sur « Payer »</strong>
							<small>Bug · il y a 2 jours</small>
						</span>
						<em data-tone="done">Corrigé</em>
					</li>
					<li>
						<span>
							<strong>L'export CSV est vide sur Safari</strong>
							<small>Bug · il y a 5 jours</small>
						</span>
						<em data-tone="progress">En cours</em>
					</li>
					<li>
						<span>
							<strong>Pouvoir dupliquer une commande</strong>
							<small>Idée · il y a 3 semaines</small>
						</span>
						<em data-tone="planned">Prévu</em>
					</li>
					<li>
						<span>
							<strong>Filtrer les lampes par culot</strong>
							<small>Idée · hier</small>
						</span>
						<em>Reçu</em>
					</li>
				</ul>
			</div>
		),
	},
	{
		id: "thread",
		name: "On lui répond",
		text: "Vos réponses arrivent dans le widget et par e-mail. Les commentaires internes restent entre vous.",
		ui: (
			<div className="w">
				<WidgetHead title="Le paiement échoue…" back />
				<div className="w-thread">
					<p className="w-msg w-msg-me">
						<small>Vous · lundi 14:02</small>
						Le paiement échoue quand je clique sur « Payer ». Le bouton tourne
						sans fin.
					</p>
					<p className="w-msg">
						<small>L'équipe · mardi 10:41</small>
						Corrigé dans la 1.4.3, merci pour la capture ! Votre panier vous
						attend.
					</p>
					<p className="w-msg w-msg-me">
						<small>Vous · mardi 11:15</small>
						Commande passée, merci.
					</p>
				</div>
				<p className="w-input w-reply">Écrire à l'équipe…</p>
			</div>
		),
	},
	{
		id: "portal",
		name: "Les idées, votées en public",
		text: "Une page publique où l'on vote et propose. Ceux qui ont voté avec leur e-mail sont prévenus quand c'est livré.",
		ui: (
			<div className="w">
				<div className="w-head">
					<strong>Lune · idées</strong>
					<span className="w-small">Proposer une idée</span>
				</div>
				<ul className="w-votes">
					{[
						["Pouvoir dupliquer une commande", 48, "Prévu", true],
						["Payer en trois fois", 31, "", false],
						["Filtrer les lampes par culot", 22, "", false],
						["Recevoir une alerte de retour en stock", 17, "En cours", false],
					].map(([t, n, s, voted]) => (
						<li key={String(t)}>
							<span className={voted ? "w-vote is-on" : "w-vote"}>
								<svg
									viewBox="0 0 12 12"
									width="12"
									height="12"
									aria-hidden="true"
								>
									<path d="M6 2.5L10 8H2z" fill="currentColor" />
								</svg>
								{n}
							</span>
							<span>
								<strong>{t}</strong>
								{s && <small>{s}</small>}
							</span>
						</li>
					))}
				</ul>
			</div>
		),
	},
];

export function Showcase() {
	const row = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState(0);

	const step = useCallback(() => {
		const el = row.current;
		const first = el?.children[0] as HTMLElement | undefined;
		const second = el?.children[1] as HTMLElement | undefined;
		if (!first || !second) return 1;
		return second.offsetLeft - first.offsetLeft;
	}, []);

	useEffect(() => {
		const el = row.current;
		if (!el) return;
		let frame = 0;
		const onScroll = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				setActive(
					Math.max(
						0,
						Math.min(PANELS.length - 1, Math.round(el.scrollLeft / step())),
					),
				);
			});
		};
		el.addEventListener("scroll", onScroll, { passive: true });

		// Drag with a mouse; touch and trackpads scroll natively.
		let startX = 0;
		let startLeft = 0;
		let dragging = false;
		const down = (e: PointerEvent) => {
			if (e.pointerType !== "mouse") return;
			dragging = true;
			startX = e.clientX;
			startLeft = el.scrollLeft;
			el.classList.add("is-dragging");
		};
		const move = (e: PointerEvent) => {
			if (!dragging) return;
			el.scrollLeft = startLeft - (e.clientX - startX);
		};
		const up = () => {
			if (!dragging) return;
			dragging = false;
			el.classList.remove("is-dragging");
			const i = Math.round(el.scrollLeft / step());
			el.scrollTo({ left: i * step(), behavior: "smooth" });
		};
		el.addEventListener("pointerdown", down);
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		return () => {
			el.removeEventListener("scroll", onScroll);
			el.removeEventListener("pointerdown", down);
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
	}, [step]);

	const go = (i: number) => {
		const clamped = Math.max(0, Math.min(PANELS.length - 1, i));
		row.current?.scrollTo({ left: clamped * step(), behavior: "smooth" });
	};

	const panel = PANELS[active];

	return (
		<section
			className="sc"
			aria-labelledby="sc-title"
			data-step-section="Le widget"
		>
			<div className="sc-row" ref={row}>
				{PANELS.map((p, i) => (
					<div
						key={p.id}
						className={i === active ? "sc-slot is-active" : "sc-slot"}
						inert={i !== active}
						aria-hidden={i !== active}
					>
						{p.ui}
					</div>
				))}
			</div>
			<div className="sc-text" aria-live="polite">
				<h2 id="sc-title" key={panel.id}>
					<span className="sr-only">Le widget, côté utilisateur : </span>
					{panel.name}
				</h2>
				<p className="sc-desc">{panel.text}</p>
				<div className="sc-nav">
					<button
						type="button"
						onClick={() => go(active - 1)}
						disabled={active === 0}
						aria-label="Panneau précédent"
					>
						<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
							<path
								d="M15 5l-7 7 7 7"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.4"
							/>
						</svg>
					</button>
					<span>
						{active + 1} sur {PANELS.length}
					</span>
					<button
						type="button"
						onClick={() => go(active + 1)}
						disabled={active === PANELS.length - 1}
						aria-label="Panneau suivant"
					>
						<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
							<path
								d="M9 5l7 7-7 7"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.4"
							/>
						</svg>
					</button>
				</div>
			</div>
		</section>
	);
}
