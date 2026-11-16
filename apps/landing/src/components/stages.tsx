"use client";

import { useState } from "react";

/**
 * From the report to the fix, as one issue moves through the dashboard.
 * A real range input drives the clause on the left and the issue's state on
 * the right; the arrow keys work too. Dashboard labels stay in English, as in
 * the product.
 */

type Stage = {
	name: string;
	clause: [string, string];
	note: string;
	status: { label: string; tone: string };
	priority: string;
	assignee: { name: string; agent?: boolean } | null;
	pr: string | null;
	activity: { who: string; what: string; at: string; quote?: string }[];
};

const STAGES: Stage[] = [
	{
		name: "Signalé",
		clause: ["D'abord, le rapport", "arrive en Triage"],
		note: "Avec la capture, les quatre étapes avant l'erreur, la requête POST /api/checkout en 500, Chrome 131 sur macOS et la version 1.4.2.",
		status: { label: "Triage", tone: "triage" },
		priority: "No priority",
		assignee: null,
		pr: null,
		activity: [
			{
				who: "Marie Dupont",
				what: "reported it from lune.example/panier",
				at: "14:02",
			},
		],
	},
	{
		name: "Trié",
		clause: ["Puis une touche", "l'accepte"],
		note: "A accepte, M fusionne avec un doublon, X refuse. Priorité et assignation se règlent avant, au clavier.",
		status: { label: "Todo", tone: "open" },
		priority: "Urgent",
		assignee: { name: "Camille Laurent" },
		pr: null,
		activity: [
			{
				who: "Marie Dupont",
				what: "reported it from lune.example/panier",
				at: "14:02",
			},
			{
				who: "Camille Laurent",
				what: "accepted it into Todo as Urgent",
				at: "14:09",
			},
		],
	},
	{
		name: "Confié",
		clause: ["Ensuite, l'agent", "ouvre la PR"],
		note: "Par MCP, l'agent lit le rapport avec get_report, trouve la cause et lie sa pull request à l'issue.",
		status: { label: "In review", tone: "review" },
		priority: "Urgent",
		assignee: { name: "Triage bot", agent: true },
		pr: "#318 Fix checkout total · open",
		activity: [
			{
				who: "Marie Dupont",
				what: "reported it from lune.example/panier",
				at: "14:02",
			},
			{ who: "Camille Laurent", what: "assigned Triage bot", at: "14:10" },
			{
				who: "Triage bot",
				what: "commented",
				at: "14:16",
				quote:
					"TypeError in checkout.ts:88: total is undefined once a promo code is removed. Fix in #318.",
			},
		],
	},
	{
		name: "Corrigé",
		clause: ["Enfin, la fusion", "le clôt"],
		note: "« Fixes Tattle #42 » dans la pull request : à la fusion, l'issue passe à Done et Marie voit « Corrigé » dans son widget.",
		status: { label: "Done", tone: "done" },
		priority: "Urgent",
		assignee: { name: "Triage bot", agent: true },
		pr: "#318 Fix checkout total · merged",
		activity: [
			{ who: "Camille Laurent", what: "assigned Triage bot", at: "14:10" },
			{ who: "Triage bot", what: "linked pull request #318", at: "14:31" },
			{
				who: "GitHub",
				what: "moved it to Done when #318 was merged",
				at: "17:40",
			},
			{
				who: "Marie Dupont",
				what: "now sees Fixed in My reports",
				at: "17:40",
			},
		],
	},
];

function StateGlyph({ tone }: { tone: string }) {
	if (tone === "done")
		return (
			<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
				<circle cx="7" cy="7" r="6" fill="currentColor" />
				<path
					d="M4.3 7.2l1.8 1.8 3.6-3.8"
					fill="none"
					stroke="#fff"
					strokeWidth="1.5"
				/>
			</svg>
		);
	if (tone === "review")
		return (
			<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
				<circle
					cx="7"
					cy="7"
					r="5.5"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
				/>
				<path d="M7 1.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
			</svg>
		);
	return (
		<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
			<circle
				cx="7"
				cy="7"
				r="5.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeDasharray={tone === "triage" ? "2.4 2" : undefined}
			/>
		</svg>
	);
}

export function Stages() {
	const [i, setI] = useState(0);
	const s = STAGES[i];

	return (
		<section
			className="st"
			aria-labelledby="st-title"
			data-step-section="Du rapport au correctif"
		>
			<div className="st-left">
				<h2 id="st-title" className="st-clause" key={s.name}>
					<span>{s.clause[0]}</span> <span>{s.clause[1]}</span>
				</h2>
				<p className="st-note">{s.note}</p>
			</div>

			<div className="st-right">
				<div className="iss" data-ui key={s.name}>
					<div className="iss-head">
						<span className="iss-num">#42</span>
						<span className={`iss-state tone-${s.status.tone}`}>
							<StateGlyph tone={s.status.tone} />
							{s.status.label}
						</span>
					</div>
					<p className="iss-title">
						Le paiement échoue quand je clique sur « Payer ».
					</p>
					<p className="iss-evidence">
						1 report · <b>1 error</b> · <b>1 failed request</b> · seen in 1.4.2
					</p>
					<dl className="iss-props">
						<dt>Priority</dt>
						<dd>
							{s.priority === "Urgent" ? (
								<span className="iss-urgent" aria-hidden="true">
									!
								</span>
							) : (
								<span className="iss-dash" aria-hidden="true">
									—
								</span>
							)}
							{s.priority}
						</dd>
						<dt>Assignee</dt>
						<dd>
							{s.assignee ? (
								<>
									<span
										className={
											s.assignee.agent ? "iss-face is-agent" : "iss-face"
										}
										aria-hidden="true"
									>
										{s.assignee.agent ? "◆" : s.assignee.name[0]}
									</span>
									{s.assignee.name}
									{s.assignee.agent && <span className="iss-tag">agent</span>}
								</>
							) : (
								"Unassigned"
							)}
						</dd>
						<dt>Pull request</dt>
						<dd>{s.pr ?? "None"}</dd>
					</dl>
					<p className="iss-sub">Activity</p>
					<ol className="iss-activity">
						{s.activity.map((a) => (
							<li key={`${a.who}-${a.at}-${a.what}`}>
								<span>
									<b>{a.who}</b> {a.what}
								</span>
								<time>{a.at}</time>
								{a.quote && <q>{a.quote}</q>}
							</li>
						))}
					</ol>
				</div>
			</div>

			<div className="st-slider">
				<label htmlFor="st-range" className="sr-only">
					Étape du parcours
				</label>
				<div className="st-track" aria-hidden="true">
					<span
						className="st-fill"
						style={{ width: `${(i / (STAGES.length - 1)) * 100}%` }}
					/>
				</div>
				<input
					id="st-range"
					type="range"
					min={0}
					max={STAGES.length - 1}
					step={1}
					value={i}
					onChange={(e) => setI(Number(e.target.value))}
					aria-valuetext={s.name}
				/>
				<ul className="st-names">
					{STAGES.map((stage, n) => (
						<li key={stage.name}>
							<button
								type="button"
								aria-current={n === i}
								onClick={() => setI(n)}
							>
								{stage.name}
							</button>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
