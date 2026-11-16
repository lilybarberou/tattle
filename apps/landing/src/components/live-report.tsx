"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The hero's live fragment: the report Tattle's widget would file from this
 * very visit. It records what the real widget records (pages, clicks, sections
 * reached, field changes, console errors, failed requests, the device), with
 * the same tabs as the dashboard, and shows the same report as an agent gets
 * it from `get_report`. Nothing leaves the browser.
 */

type Kind = "navigate" | "click" | "scroll" | "input" | "error" | "failed";
type Step = { at: number; kind: Kind; target: string };
type ConsoleEntry = { at: number; level: "error" | "warn"; message: string };
type NetworkEntry = { at: number; method: string; url: string; status: number };
type Device = {
	browser: string;
	system: string;
	language: string;
	scheme: string;
	ratio: string;
	page: string;
};

const TABS = ["Étapes", "Console", "Réseau", "Appareil"] as const;
type Tab = (typeof TABS)[number];

const KIND_LABEL: Record<Kind, string> = {
	navigate: "navigate",
	click: "click",
	scroll: "scroll",
	input: "input",
	error: "error",
	failed: "failed",
};

function clock(at: number) {
	return new Date(at).toLocaleTimeString("fr-FR", { hour12: false });
}

function plural(n: number, one: string, many: string) {
	return `${n} ${n === 1 ? one : many}`;
}

function readDevice(): Device {
	const ua = navigator.userAgent;
	const pick = (re: RegExp) => ua.match(re)?.[1];
	let browser = "Navigateur";
	if (pick(/Edg\/(\d+)/)) browser = `Edge ${pick(/Edg\/(\d+)/)}`;
	else if (pick(/OPR\/(\d+)/)) browser = `Opera ${pick(/OPR\/(\d+)/)}`;
	else if (pick(/Firefox\/(\d+)/))
		browser = `Firefox ${pick(/Firefox\/(\d+)/)}`;
	else if (pick(/Chrome\/(\d+)/)) browser = `Chrome ${pick(/Chrome\/(\d+)/)}`;
	else if (pick(/Version\/(\d+(?:\.\d+)?).*Safari/))
		browser = `Safari ${pick(/Version\/(\d+(?:\.\d+)?)/)}`;
	let system = "Système inconnu";
	if (/iPhone|iPad/.test(ua))
		system = `iOS ${(pick(/OS (\d+)_/) ?? "").trim()}`.trim();
	else if (/Android/.test(ua))
		system = `Android ${pick(/Android (\d+)/) ?? ""}`.trim();
	else if (/Mac OS X/.test(ua)) system = "macOS";
	else if (/Windows/.test(ua)) system = "Windows";
	else if (/Linux/.test(ua)) system = "Linux";
	return {
		browser,
		system,
		language: navigator.language,
		scheme: matchMedia("(prefers-color-scheme: dark)").matches
			? "Sombre"
			: "Clair",
		ratio: `${window.devicePixelRatio}×`,
		page: location.pathname,
	};
}

/** A short, human label for what was clicked, the way the widget names it. */
function labelOf(el: Element): string {
	const aria = el.getAttribute("aria-label");
	const text = aria ?? el.textContent ?? "";
	const clean = text.replace(/\s+/g, " ").trim();
	if (!clean) return el.tagName.toLowerCase();
	return `« ${clean.length > 38 ? `${clean.slice(0, 37)}…` : clean} »`;
}

export function LiveReport() {
	const root = useRef<HTMLDivElement>(null);
	const [title, setTitle] = useState("Ce que Tattle verrait de votre visite");
	const [steps, setSteps] = useState<Step[]>([]);
	const [consoleLog, setConsoleLog] = useState<ConsoleEntry[]>([]);
	const [network, setNetwork] = useState<NetworkEntry[]>([]);
	const [device, setDevice] = useState<Device | null>(null);
	const [size, setSize] = useState<string>("—");
	const [tab, setTab] = useState<Tab>("Étapes");
	const [view, setView] = useState<"dashboard" | "agent">("dashboard");
	const listRef = useRef<HTMLOListElement>(null);

	useEffect(() => {
		const push = (kind: Kind, target: string) =>
			setSteps((s) => {
				const last = s[s.length - 1];
				if (last && last.kind === kind && last.target === target) return s;
				return [...s, { at: Date.now(), kind, target }].slice(-40);
			});

		setDevice(readDevice());
		push("navigate", location.pathname);
		const onResize = () =>
			setSize(`${window.innerWidth} × ${window.innerHeight}`);
		onResize();
		window.addEventListener("resize", onResize);

		const onClick = (e: MouseEvent) => {
			const el = (e.target as Element | null)?.closest(
				"a, button, summary, label, input, [role='tab'], video",
			);
			if (!el) return;
			// The fragment's own tabs are the dashboard, not the visit.
			if (root.current?.contains(el) && !el.hasAttribute("data-step")) return;
			push("click", labelOf(el));
		};
		document.addEventListener("click", onClick, true);

		const onChange = (e: Event) => {
			const el = e.target as HTMLInputElement;
			if (root.current?.contains(el)) return;
			const name = el.labels?.[0]?.textContent?.trim() || el.name || el.type;
			push("input", `Champ « ${name} » modifié`);
		};
		document.addEventListener("change", onChange, true);

		const sections = document.querySelectorAll<HTMLElement>(
			"[data-step-section]",
		);
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						push(
							"scroll",
							`Section « ${(entry.target as HTMLElement).dataset.stepSection} »`,
						);
					}
				}
			},
			{ threshold: 0.45 },
		);
		for (const s of sections) io.observe(s);

		// The same hooks the widget installs: console errors and warnings,
		// uncaught errors, and requests that fail.
		// Called bare, not as `original.fetch(…)`: fetch needs `window` as `this`.
		const nativeFetch = window.fetch.bind(window);
		const original = {
			error: console.error,
			warn: console.warn,
			fetch: window.fetch,
		};
		const record = (level: "error" | "warn", args: unknown[]) => {
			const message = args
				.map((a) =>
					a instanceof Error ? `${a.name}: ${a.message}` : String(a),
				)
				.join(" ")
				.slice(0, 160);
			const at = Date.now();
			// Deferred: console.error can fire while React renders.
			queueMicrotask(() => {
				setConsoleLog((c) => [...c, { at, level, message }].slice(-20));
				if (level === "error") push("error", message);
			});
		};
		console.error = (...args: unknown[]) => {
			record("error", args);
			original.error.apply(console, args);
		};
		console.warn = (...args: unknown[]) => {
			record("warn", args);
			original.warn.apply(console, args);
		};
		const onError = (e: ErrorEvent) => record("error", [e.error ?? e.message]);
		window.addEventListener("error", onError);
		window.fetch = async (input, init) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			const method = (
				init?.method ?? (input instanceof Request ? input.method : "GET")
			).toUpperCase();
			const path = url.startsWith(location.origin)
				? url.slice(location.origin.length)
				: url;
			// The Next.js dev overlay's own requests are not the visitor's.
			if (path.startsWith("/__nextjs")) return nativeFetch(input, init);
			try {
				const res = await nativeFetch(input, init);
				if (!res.ok) {
					setNetwork((n) => [
						...n,
						{ at: Date.now(), method, url: path, status: res.status },
					]);
					push("failed", `${method} ${path} ${res.status}`);
				}
				return res;
			} catch (err) {
				setNetwork((n) => [
					...n,
					{ at: Date.now(), method, url: path, status: 0 },
				]);
				push("failed", `${method} ${path} (réseau)`);
				throw err;
			}
		};

		return () => {
			window.removeEventListener("resize", onResize);
			document.removeEventListener("click", onClick, true);
			document.removeEventListener("change", onChange, true);
			window.removeEventListener("error", onError);
			io.disconnect();
			console.error = original.error;
			console.warn = original.warn;
			window.fetch = original.fetch;
		};
	}, []);

	// Keep the newest step in view, like the dashboard's timeline.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on each new step
	useEffect(() => {
		const list = listRef.current;
		if (list) list.scrollTop = list.scrollHeight;
	}, [steps.length, tab]);

	const errors = consoleLog.filter((c) => c.level === "error").length;
	const failed = network.length;

	const breakSomething = () => {
		console.error(
			new TypeError("Cannot read properties of undefined (reading 'total')"),
		);
		void fetch("/api/checkout", { method: "POST" }).catch(() => {});
	};

	const agentJson = useMemo(
		() =>
			JSON.stringify(
				{
					message: title,
					untrustedUserContent: true,
					page: device?.page ?? "/",
					device: device && {
						browser: device.browser,
						os: device.system,
						window: size,
						pixelRatio: device.ratio,
						language: device.language,
					},
					timeline: steps
						.slice(-6)
						.map((s) => ({ at: clock(s.at), kind: s.kind, target: s.target })),
					console: consoleLog
						.slice(-3)
						.map((c) => ({ level: c.level, message: c.message })),
					network: network
						.slice(-3)
						.map((n) => ({ method: n.method, url: n.url, status: n.status })),
				},
				null,
				2,
			),
		[title, device, size, steps, consoleLog, network],
	);

	return (
		<div className="lr" data-ui ref={root}>
			<div className="lr-head">
				<span className="lr-num">#43</span>
				<span className="lr-muted">Rapport de cette visite</span>
				<span className="lr-state">
					<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
						<circle
							cx="7"
							cy="7"
							r="5.5"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.6"
							strokeDasharray="2.4 2"
						/>
					</svg>
					Triage
				</span>
			</div>

			<label className="lr-title">
				<span className="sr-only">Message du rapport</span>
				<input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					maxLength={80}
				/>
			</label>
			<p className="lr-evidence">
				{plural(steps.length, "étape", "étapes")} ·{" "}
				<span className={errors ? "lr-bad" : undefined}>
					{plural(errors, "erreur", "erreurs")}
				</span>{" "}
				·{" "}
				<span className={failed ? "lr-bad" : undefined}>
					{plural(failed, "requête en échec", "requêtes en échec")}
				</span>
			</p>

			<div className="lr-switch">
				<button
					type="button"
					aria-pressed={view === "dashboard"}
					onClick={() => setView("dashboard")}
				>
					Tableau de bord
				</button>
				<button
					type="button"
					aria-pressed={view === "agent"}
					onClick={() => setView("agent")}
				>
					Ce que lit l'agent
				</button>
			</div>

			{view === "dashboard" ? (
				<>
					<div
						className="lr-tabs"
						role="tablist"
						aria-label="Contenu du rapport"
					>
						{TABS.map((t) => (
							<button
								key={t}
								type="button"
								role="tab"
								aria-selected={tab === t}
								onClick={() => setTab(t)}
							>
								{t}
								<span className="lr-count">
									{t === "Étapes"
										? steps.length
										: t === "Console"
											? consoleLog.length
											: t === "Réseau"
												? failed
												: ""}
								</span>
							</button>
						))}
					</div>
					<div className="lr-body" role="tabpanel">
						{tab === "Étapes" && (
							<ol className="lr-steps" ref={listRef}>
								{steps.map((s) => (
									<li key={`${s.at}-${s.kind}-${s.target}`} data-kind={s.kind}>
										<time>{clock(s.at)}</time>
										<span className="lr-kind">{KIND_LABEL[s.kind]}</span>
										<span className="lr-target">{s.target}</span>
									</li>
								))}
							</ol>
						)}
						{tab === "Console" &&
							(consoleLog.length ? (
								<ol className="lr-steps" ref={listRef}>
									{consoleLog.map((c) => (
										<li
											key={`${c.at}-${c.message}`}
											data-kind={c.level === "error" ? "error" : "click"}
										>
											<time>{clock(c.at)}</time>
											<span className="lr-kind">{c.level}</span>
											<span className="lr-target">{c.message}</span>
										</li>
									))}
								</ol>
							) : (
								<p className="lr-empty">
									Rien n'a été journalisé avant le rapport.
								</p>
							))}
						{tab === "Réseau" &&
							(network.length ? (
								<ol className="lr-steps" ref={listRef}>
									{network.map((n) => (
										<li key={`${n.at}-${n.url}`} data-kind="failed">
											<time>{clock(n.at)}</time>
											<span className="lr-kind">{n.status || "—"}</span>
											<span className="lr-target">
												{n.method} {n.url}
											</span>
										</li>
									))}
								</ol>
							) : (
								<p className="lr-empty">Aucune requête en échec.</p>
							))}
						{tab === "Appareil" && (
							<dl className="lr-device">
								<dt>Navigateur</dt>
								<dd>{device?.browser ?? "—"}</dd>
								<dt>Système</dt>
								<dd>{device?.system ?? "—"}</dd>
								<dt>Fenêtre</dt>
								<dd>{size}</dd>
								<dt>Densité</dt>
								<dd>{device?.ratio ?? "—"}</dd>
								<dt>Langue</dt>
								<dd>{device?.language ?? "—"}</dd>
								<dt>Thème</dt>
								<dd>{device?.scheme ?? "—"}</dd>
							</dl>
						)}
					</div>
				</>
			) : (
				<pre className="lr-json">
					<code>{agentJson}</code>
				</pre>
			)}

			<div className="lr-foot">
				<button
					type="button"
					className="lr-break"
					data-step
					onClick={breakSomething}
				>
					Provoquer une erreur
				</button>
				<span className="lr-muted">Fenêtre {size}</span>
			</div>
		</div>
	);
}
