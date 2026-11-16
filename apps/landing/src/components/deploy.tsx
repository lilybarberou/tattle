"use client";

import { useMemo, useState } from "react";
import { DOCS } from "./brand";

/**
 * The closing dialog: type your domain, pick where it runs, copy the exact
 * commands from the self-hosting guide with your values and fresh secrets
 * generated on your server.
 */

const RAW = "https://raw.githubusercontent.com/lilybarberou/tattle/main/deploy";

function commands(domain: string, https: boolean) {
	const url = https ? `https://${domain}` : "http://localhost:3000";
	const edits = [
		`s|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=${url}|`,
		"s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|",
		"s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|",
		...(https
			? [
					`s|^DOMAIN=.*|DOMAIN=${domain}|`,
					"s|^TRUST_PROXY=.*|TRUST_PROXY=true|",
				]
			: []),
	];
	return [
		"mkdir tattle && cd tattle",
		`curl -fsSLO ${RAW}/compose.yaml`,
		`curl -fsSL ${RAW}/.env.example -o .env`,
		`sed -i.bak "${edits.join("; ")}" .env`,
		https ? "docker compose --profile https up -d" : "docker compose up -d",
		"docker compose logs app | grep setup",
	].join("\n");
}

export function Deploy() {
	const [domain, setDomain] = useState("bugs.lune.example");
	const [https, setHttps] = useState(true);
	const [copied, setCopied] = useState(false);
	const clean =
		domain
			.trim()
			.replace(/^https?:\/\//, "")
			.replace(/\/+$/, "") || "bugs.lune.example";
	const text = useMemo(() => commands(clean, https), [clean, https]);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2400);
		} catch {
			setCopied(false);
		}
	};

	return (
		<section
			className="cta"
			id="deployer"
			aria-labelledby="cta-title"
			data-step-section="Déployer"
		>
			<div className="cta-copy" data-reveal>
				<h2 id="cta-title" data-reveal-item>
					<span>Lancez-le</span> <span>ce soir</span>
				</h2>
				<p data-reveal-item>
					Six commandes sur un serveur avec Docker. Le premier compte créé
					devient l'admin, avec le code affiché dans les logs.{" "}
					<a href={DOCS.selfHosting}>Le guide pas à pas</a>
				</p>
			</div>
			<div className="dlg" data-ui>
				<div className="dlg-head">
					<strong id="dlg-title">Installer Tattle</strong>
					<span>Votre serveur, vos données</span>
				</div>
				<fieldset className="dlg-seg">
					<legend className="sr-only">Où il tourne</legend>
					<label>
						<input
							type="radio"
							name="where"
							checked={https}
							onChange={() => setHttps(true)}
						/>
						Sur un domaine, HTTPS
					</label>
					<label>
						<input
							type="radio"
							name="where"
							checked={!https}
							onChange={() => setHttps(false)}
						/>
						Sur ce poste
					</label>
				</fieldset>
				<label className="dlg-field">
					<span>Adresse</span>
					<input
						name="domain"
						value={https ? domain : "localhost:3000"}
						disabled={!https}
						onChange={(e) => setDomain(e.target.value)}
						spellCheck={false}
						autoComplete="off"
					/>
				</label>
				<pre className="dlg-code">
					<code>{text}</code>
				</pre>
				<button type="button" className="dlg-primary" onClick={copy}>
					{copied ? "Copié dans le presse-papiers" : "Copier les commandes"}
				</button>
			</div>
		</section>
	);
}
