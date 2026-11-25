import { describe, expect, it } from "vitest";
import type { Locale } from "#/i18n";
import {
	type ChatMessage,
	describeEvent,
	toDiscord,
	toSlack,
} from "#/server/chat-format";
import {
	CHAT_SAMPLES,
	SAMPLE_SECRETS,
	sampleMessage,
} from "../scripts/chat-samples";

const project = { id: "p1", name: "Wokinu" };
const base = "http://localhost:3000/p/p1/issues";

const issue = {
	number: 7,
	title: "Checkout button does nothing",
	type: "bug" as const,
	status: "triage",
};

const describe_ = (event: string, data: unknown, locale: Locale = "en") =>
	describeEvent(
		event as Parameters<typeof describeEvent>[0],
		project,
		data,
		locale,
	);

const sample = (name: string, locale: Locale) => {
	const found = CHAT_SAMPLES.find((s) => s.name === name);
	if (!found) throw new Error(`No sample ${name}`);
	return sampleMessage(found, locale) as ChatMessage;
};

const fieldNames = (message: ChatMessage | null) =>
	message?.fields.map(([name]) => name);

describe("report.created", () => {
	it("says who, where, on which device and what came with it", () => {
		expect(sample("report.created", "en")).toEqual({
			title: '🐞 Acme Shop (test) #42 · Checkout fails when I tap "Pay"',
			url: "http://localhost:3000/p/prj_sample/issues/42#report-rep_7Hq2xK",
			text: expect.stringContaining("My card was not charged."),
			color: 0xc4242a,
			fields: [
				["Reporter", "Camille Martin"],
				["Email", "camille.martin@example.com"],
				["User id", "usr_8f2k"],
				["plan", "Pro"],
				["company", "Studio Nord"],
				["signupDate", "2026-03-02"],
				["Page", "https://shop.example.com/checkout?step=payment"],
				["Device", "Chrome 131 · macOS 15.1"],
				["Release", "2026.11.3"],
				["Language", "fr-FR"],
				[
					"Evidence",
					"2 console errors · 1 failed request · screenshot attached",
				],
				["Possible duplicate of", "#38 Payment button spins forever"],
			],
		});
	});

	it("is in French too", () => {
		const message = sample("report.created", "fr");
		expect(message.title).toBe(
			'🐞 Acme Shop (test) #42 · Checkout fails when I tap "Pay"',
		);
		expect(message.fields).toEqual([
			["Auteur", "Camille Martin"],
			["E-mail", "camille.martin@example.com"],
			["Id utilisateur", "usr_8f2k"],
			["plan", "Pro"],
			["company", "Studio Nord"],
			["signupDate", "2026-03-02"],
			["Page", "https://shop.example.com/checkout?step=payment"],
			["Appareil", "Chrome 131 · macOS 15.1"],
			["Version", "2026.11.3"],
			["Langue", "fr-FR"],
			[
				"Indices",
				"2 erreurs de console · 1 requête en échec · capture d'écran jointe",
			],
			["Doublon possible de", "#38 Payment button spins forever"],
		]);
	});

	it("describes a mobile app's screen, phone and version", () => {
		expect(sample("report.created mobile", "en")).toMatchObject({
			title: "💡 Acme Shop (test) #43 · Let me save my cart for later",
			color: 0x2f6fd0,
			fields: [
				["Reporter", "sam.lee@example.com"],
				["Screen", "CartScreen"],
				["Device", "Samsung SM-S931B · Android 15"],
				// The release is the app's version: shown once.
				["App", "Acme 3.2.0 (412)"],
				["Language", "en-GB"],
			],
		});
		expect(fieldNames(sample("report.created mobile", "fr"))).toEqual([
			"Auteur",
			"Écran",
			"Appareil",
			"App",
			"Langue",
		]);
	});

	it("calls an anonymous reporter someone and leaves out what is unknown", () => {
		for (const [locale, someone] of [
			["en", "Someone"],
			["fr", "Quelqu'un"],
		] as const) {
			const message = describe_(
				"report.created",
				{ issue, report: { message: "Broken", pageUrl: "" } },
				locale,
			);
			expect(message?.fields).toEqual([
				[locale === "en" ? "Reporter" : "Auteur", someone],
			]);
			expect(message?.url).toBe(`${base}/7`);
		}
	});

	it("shows the email alone when it is all there is", () => {
		const message = describe_("report.created", {
			issue,
			report: {
				message: "Broken",
				pageUrl: "/",
				reporter: { email: "jo@example.com" },
			},
		});
		expect(message?.fields[0]).toEqual(["Reporter", "jo@example.com"]);
		expect(fieldNames(message)).not.toContain("Email");
	});

	it("keeps at most 3 traits, and never one that may hold a secret", () => {
		const message = describe_("report.created", {
			issue,
			report: {
				message: "Broken",
				pageUrl: "/",
				reporter: {
					id: "u1",
					traits: {
						password: "hunter2",
						apiKey: "k_1",
						authToken: "t_1",
						userHash: "h_1",
						nested: { a: 1 },
						"": "empty key",
						author: "kept",
						plan: "Team",
						seats: 12,
						beta: true,
					},
				},
			},
		});
		expect(message?.fields).toEqual([
			["Reporter", "Someone"],
			["User id", "u1"],
			["author", "kept"],
			["plan", "Team"],
			["seats", "12"],
			["Screen", "/"],
		]);
	});
});

describe("issue.created", () => {
	it("says the type, who created it, the priority and the labels", () => {
		expect(sample("issue.created", "en")).toEqual({
			title: "🆕 Acme Shop (test) #44 · Retry failed card payments once",
			url: "http://localhost:3000/p/prj_sample/issues/44",
			text: "Stripe answers 502 now and then. Retry once after 2 seconds before showing an error.\n\nSeen in #42 and #38.",
			color: 0x1b6c80,
			fields: [
				["Type", "Bug"],
				["Created by", "Triage bot (agent)"],
				["Priority", "High"],
				["Labels", "payments, web"],
			],
		});
		expect(sample("issue.created", "fr").fields).toEqual([
			["Type", "Bug"],
			["Créé par", "Triage bot (agent)"],
			["Priorité", "Haute"],
			["Étiquettes", "payments, web"],
		]);
	});

	it("leaves out an empty priority and labels", () => {
		const message = describe_(
			"issue.created",
			{
				issue: { ...issue, type: "feature", priority: 0, labels: [] },
				actor: { type: "user", name: "Ada" },
			},
			"fr",
		);
		expect(message?.fields).toEqual([
			["Type", "Demande"],
			["Créé par", "Ada"],
		]);
		expect(message?.text).toBe("");
	});

	it("skips issues opened by the widget (the report already says it)", () => {
		expect(
			describe_("issue.created", {
				issue,
				actor: { type: "system", name: "Widget" },
			}),
		).toBeNull();
	});
});

describe("issue.updated", () => {
	it("gives the status change, the assignee, the pull request and who did it", () => {
		expect(sample("issue.updated", "en")).toEqual({
			title: '🔄 Acme Shop (test) #42 · Checkout fails when I tap "Pay"',
			url: "http://localhost:3000/p/prj_sample/issues/42",
			text: "",
			color: 0x1b6c80,
			fields: [
				["Status", "In progress → In review"],
				["Assignee", "Lou Bernard"],
				["Pull request", "https://github.com/acme/shop/pull/318"],
				["By", "Lou Bernard"],
			],
		});
		expect(sample("issue.updated", "fr").fields).toEqual([
			["Statut", "En cours → En revue"],
			["Assigné à", "Lou Bernard"],
			["Pull request", "https://github.com/acme/shop/pull/318"],
			["Par", "Lou Bernard"],
		]);
	});

	it("describes a merge into another issue", () => {
		const message = sample("issue.updated merged", "fr");
		expect(message.title.startsWith("🔀 Acme Shop (test) #45 · ")).toBe(true);
		expect(message.fields).toEqual([
			["Statut", "Triage → Doublon"],
			["Fusionné dans", '#42 Checkout fails when I tap "Pay"'],
			["Par", "Ada Moreau"],
		]);
	});

	it("names the release of a regression", () => {
		expect(sample("issue.updated regression", "en")).toMatchObject({
			title: '⚠️ Acme Shop (test) #42 · Checkout fails when I tap "Pay"',
			color: 0xa86f0c,
		});
		expect(sample("issue.updated regression", "en").fields).toEqual([
			["Status", "Done → Todo"],
			["Regressed in", "2026.11.4"],
			["By", "Tattle"],
		]);
		expect(
			describe_(
				"issue.updated",
				{
					issue,
					changes: { status: { from: "done", to: "todo" } },
					regression: { release: null },
				},
				"fr",
			)?.fields[1],
		).toEqual(["Régression dans", "signalé à nouveau après sa résolution"]);
	});

	it("says when an issue is unassigned, and flags agents", () => {
		const message = describe_("issue.updated", {
			issue,
			changes: { assigneeName: { from: "Ada", to: null } },
			actor: { type: "agent", name: "Bot" },
		});
		expect(message?.title).toBe("👤 Wokinu #7 · Checkout button does nothing");
		expect(message?.fields).toEqual([
			["Assignee", "Nobody"],
			["By", "Bot (agent)"],
		]);
	});

	it("leaves the pull request out until the issue is in review", () => {
		const message = describe_("issue.updated", {
			issue: { ...issue, prUrl: "https://github.com/o/r/pull/1" },
			changes: { status: { from: "todo", to: "in_progress" } },
		});
		expect(fieldNames(message)).toEqual(["Status", "By"]);
		expect(message?.fields[1]).toEqual(["By", "Someone"]);
	});

	it("uses the done colour and icon when an issue ships", () => {
		const message = describe_("issue.updated", {
			issue,
			changes: { status: { from: "in_review", to: "done" } },
		});
		expect(message?.color).toBe(0x1e7b4f);
		expect(message?.title.startsWith("✅ Wokinu #7")).toBe(true);
	});

	it("ignores updates that are not worth a message", () => {
		expect(
			describe_("issue.updated", {
				issue,
				changes: { labels: { from: [], to: ["ui"] } },
			}),
		).toBeNull();
		expect(
			describe_("issue.updated", {
				issue,
				changes: { title: { from: "a", to: "b" } },
			}),
		).toBeNull();
	});
});

describe("comment.created", () => {
	it("gives the author and the first lines of the comment", () => {
		expect(sample("comment.created", "en")).toEqual({
			title: '💬 Acme Shop (test) #42 · Checkout fails when I tap "Pay"',
			url: "http://localhost:3000/p/prj_sample/issues/42",
			text: "Reproduced on Chrome 131: the payment API answers 502.\nThe retry from #44 should fix it.",
			color: 0x5d5f60,
			fields: [["Author", "Lou Bernard"]],
		});
		expect(sample("comment.created", "fr").fields).toEqual([
			["Auteur", "Lou Bernard"],
		]);
	});

	it("keeps only the first lines of a long comment", () => {
		const body = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join(
			"\n",
		);
		const message = describe_("comment.created", {
			issue,
			comment: { body, author: { name: "Bot", type: "agent" } },
		});
		expect(message?.text).toBe(`${body.split("\n").slice(0, 8).join("\n")}\n…`);
		expect(message?.fields).toEqual([["Author", "Bot (agent)"]]);
	});
});

describe("message.created", () => {
	it("names the reporter and their email, and links to their report", () => {
		expect(sample("message.created from reporter", "en")).toEqual({
			title: '📨 Acme Shop (test) #42 · Checkout fails when I tap "Pay"',
			url: "http://localhost:3000/p/prj_sample/issues/42#report-rep_7Hq2xK",
			text: "Still failing this morning, on my phone too.",
			color: 0x2f6fd0,
			fields: [
				["From", "Camille Martin"],
				["Email", "camille.martin@example.com"],
			],
		});
		expect(sample("message.created from reporter", "fr").fields).toEqual([
			["De", "Camille Martin"],
			["E-mail", "camille.martin@example.com"],
		]);
	});

	it("names the team member who replied, and to whom", () => {
		expect(sample("message.created to reporter", "en")).toMatchObject({
			title: '↩️ Acme Shop (test) #42 · Checkout fails when I tap "Pay"',
			text: "Thanks Camille, we found the cause. A fix ships tomorrow.",
			fields: [
				["Author", "Lou Bernard"],
				["To", "Camille Martin"],
			],
		});
		expect(sample("message.created to reporter", "fr").fields).toEqual([
			["Auteur", "Lou Bernard"],
			["À", "Camille Martin"],
		]);
	});

	it("falls back to the message's author for a reporter without a name", () => {
		const message = describe_("message.created", {
			issue,
			report: { id: "r1", message: "x", reporter: null },
			message: {
				from: "reporter",
				body: "Hello",
				author: { name: "Reporter", type: "reporter" },
			},
		});
		expect(message?.fields).toEqual([["From", "Reporter"]]);
		expect(message?.url).toBe(`${base}/7#report-r1`);
	});
});

describe("ping", () => {
	it("names the project and links to its settings", () => {
		expect(sample("ping", "en")).toMatchObject({
			title: "✅ Acme Shop (test) · Tattle is connected",
			url: "http://localhost:3000/p/prj_sample/settings",
		});
		expect(sample("ping", "fr").title).toBe(
			"✅ Acme Shop (test) · Tattle est connecté",
		);
	});
});

describe("every message", () => {
	const all = CHAT_SAMPLES.flatMap((s) =>
		(["en", "fr"] as const).map((locale) => ({
			name: `${s.name} (${locale})`,
			message: sampleMessage(s, locale) as ChatMessage,
		})),
	);

	it.each(all)("$name starts with the project's name", ({ message }) => {
		expect(message.title).toMatch(/^\S+ Acme Shop \(test\)( #\d+)? · /);
	});

	it.each(all)(
		"$name links to an issue, a report or the settings",
		({ message }) => {
			expect(message.url).toMatch(
				/^http:\/\/localhost:3000\/p\/prj_sample\/(issues\/\d+(#report-\w+)?|settings)$/,
			);
		},
	);

	it.each(all)("$name carries no secret", ({ message }) => {
		const payloads = JSON.stringify([toDiscord(message), toSlack(message)]);
		for (const secret of SAMPLE_SECRETS) expect(payloads).not.toContain(secret);
		expect(payloads).not.toMatch(/reporterKey|userHash|apiToken|password/i);
	});

	it.each(all)("$name keeps field values short", ({ message }) => {
		for (const [, value] of message.fields)
			expect(value.length).toBeLessThanOrEqual(200);
	});

	it("never shows logs, only their counts", () => {
		const message = describe_("report.created", {
			issue,
			report: {
				message: "Broken",
				pageUrl: "/",
				consoleErrors: 1,
				console: [{ level: "error", message: "TypeError: secret stack" }],
				network: [{ url: "https://api.example.com/?token=abc" }],
			},
		});
		const payload = JSON.stringify(toDiscord(message as ChatMessage));
		expect(payload).not.toContain("secret stack");
		expect(payload).not.toContain("token=abc");
		expect(payload).toContain("1 console error");
	});
});

/**
 * How a notification hub such as Clairon reads a message's level: a level
 * emoji anywhere in the title first, else the colour's hue (HSV), with a red
 * behind a title that starts with another emoji read as a brand colour.
 */
const hubLevel = (title: string, color: number | null) => {
	const text = title.replace(/\uFE0F/g, "");
	const emojis = {
		error: ["🔴", "❌", "🚨", "💥", "🔥", "⛔", "🛑"],
		warning: ["⚠", "🟠", "🟡", "🚩"],
		success: ["✅", "🟢", "🎉", "✔"],
	};
	let best: { level: string; at: number } | null = null;
	for (const [level, list] of Object.entries(emojis))
		for (const emoji of list) {
			const at = text.indexOf(emoji);
			if (at !== -1 && (!best || at < best.at)) best = { level, at };
		}
	if (best) return best.level;
	if (color === null) return "info";
	const [r, g, b] = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
	const max = Math.max(r, g, b);
	const delta = max - Math.min(r, g, b);
	const saturation = max === 0 ? 0 : delta / max;
	if (saturation < 0.25 || (max / 255 >= 0.9 && saturation < 0.4))
		return "info";
	let hue =
		max === r
			? 60 * (((g - b) / delta) % 6)
			: max === g
				? 60 * ((b - r) / delta + 2)
				: 60 * ((r - g) / delta + 4);
	if (hue < 0) hue += 360;
	if (hue < 20 || hue >= 340)
		return /^\s*\p{Extended_Pictographic}/u.test(title) ? "info" : "error";
	if (hue < 65) return "warning";
	if (hue >= 75 && hue < 170) return "success";
	return "info";
};

describe("levels a notification hub reads", () => {
	const expected: Record<string, [icon: string, color: number, level: string]> =
		{
			"report.created": ["🐞", 0xc4242a, "info"],
			"report.created mobile": ["💡", 0x2f6fd0, "info"],
			"issue.created": ["🆕", 0x1b6c80, "info"],
			"issue.updated": ["🔄", 0x1b6c80, "info"],
			"issue.updated merged": ["🔀", 0x1b6c80, "info"],
			"issue.updated regression": ["⚠️", 0xa86f0c, "warning"],
			"comment.created": ["💬", 0x5d5f60, "info"],
			"message.created from reporter": ["📨", 0x2f6fd0, "info"],
			"message.created to reporter": ["↩️", 0x5d5f60, "info"],
			ping: ["✅", 0x1b6c80, "success"],
		};

	it("covers every sample", () => {
		expect(Object.keys(expected).sort()).toEqual(
			CHAT_SAMPLES.map((s) => s.name).sort(),
		);
	});

	it.each(Object.entries(expected))("%s: %j", (name, [icon, color, level]) => {
		for (const locale of ["en", "fr"] as const) {
			const message = sample(name, locale);
			expect(message.title.startsWith(`${icon} `)).toBe(true);
			expect(message.color).toBe(color);
			const embed = (
				toDiscord(message).embeds as Array<{ title: string; color: number }>
			)[0];
			expect(hubLevel(embed?.title ?? "", embed?.color ?? null)).toBe(level);
			// Slack gets no colour: the title's emoji alone sets the level.
			const slack = toSlack(message);
			expect(slack).not.toHaveProperty("attachments");
			const slackTitle = /^<[^|]+\|([^>]*)>/.exec(String(slack.text))?.[1];
			expect(hubLevel(slackTitle ?? "", null)).toBe(level);
		}
	});

	it("reads a shipped issue as a success and a bug in review as info", () => {
		const done = describe_("issue.updated", {
			issue,
			changes: { status: { from: "in_review", to: "done" } },
		}) as ChatMessage;
		expect(hubLevel(done.title, done.color)).toBe("success");
		const assigned = describe_("issue.updated", {
			issue,
			changes: { assigneeName: { from: null, to: "Ada" } },
		}) as ChatMessage;
		expect(assigned.title.startsWith("👤 ")).toBe(true);
		expect(hubLevel(assigned.title, assigned.color)).toBe("info");
		const feature = describe_("report.created", {
			issue: { ...issue, type: "feature" },
			report: { message: "Dark mode", pageUrl: "/" },
		}) as ChatMessage;
		expect(hubLevel(feature.title, feature.color)).toBe("info");
	});
});

describe("long values", () => {
	it("are cut with an ellipsis", () => {
		const message = describe_("report.created", {
			issue: { ...issue, title: "t".repeat(300) },
			report: {
				message: "a".repeat(2000),
				pageUrl: `https://example.com/${"p".repeat(300)}`,
				reporter: { name: "n".repeat(200), email: `${"e".repeat(200)}@x.io` },
			},
		});
		expect(message?.text).toHaveLength(1500);
		expect(message?.text.endsWith("…")).toBe(true);
		// The issue's title is cut at 200 characters, after the project's name.
		expect(message?.title).toBe(`🐞 Wokinu #7 · ${"t".repeat(199)}…`);
		for (const [, value] of message?.fields ?? []) {
			expect(value.length).toBeLessThanOrEqual(200);
		}
		expect(message?.fields[0]?.[1]).toHaveLength(80);
		expect(message?.fields[0]?.[1].endsWith("…")).toBe(true);
	});

	it("cut a long project name", () => {
		const message = describeEvent(
			"comment.created",
			{ id: "p1", name: "P".repeat(100) },
			{ issue, comment: { body: "Hi", author: { name: "A", type: "user" } } },
		);
		expect(message?.title).toBe(
			`💬 ${"P".repeat(39)}… #7 · Checkout button does nothing`,
		);
	});
});

describe("toDiscord / toSlack", () => {
	const message: ChatMessage = {
		title: "🔄 Wokinu #7 · Checkout",
		url: "http://localhost:3000/p/p1/issues/7",
		text: "Fixed **now**",
		color: 0x1e7b4f,
		fields: [["From", "Jo"]],
	};

	it("builds a Discord embed that pings no one", () => {
		expect(toDiscord(message)).toEqual({
			username: "Tattle",
			allowed_mentions: { parse: [] },
			embeds: [
				{
					title: "🔄 Wokinu #7 · Checkout",
					url: message.url,
					description: "Fixed **now**",
					color: 0x1e7b4f,
					fields: [{ name: "From", value: "Jo", inline: false }],
				},
			],
		});
	});

	it("leaves the description out of a Discord embed without text", () => {
		const embed = (toDiscord({ ...message, text: "" }).embeds as object[])[0];
		expect(embed).not.toHaveProperty("description");
	});

	it("builds a Slack message with single-asterisk bold", () => {
		expect(toSlack(message)).toEqual({
			text: `<${message.url}|🔄 Wokinu #7 · Checkout>\nFixed *now*\n*From:* Jo`,
			unfurl_links: false,
		});
		expect(toSlack({ ...message, text: "", fields: [] }).text).toBe(
			`<${message.url}|🔄 Wokinu #7 · Checkout>`,
		);
	});

	it("keeps what reporters wrote as plain text in Slack", () => {
		const built = describe_("report.created", {
			issue: { ...issue, title: "a | b <!here>" },
			report: {
				message: "<!channel> see <https://evil.example|your invoice> & pay",
				pageUrl: "/",
				reporter: { name: "<@U123>", email: "x@example.com" },
			},
		}) as ChatMessage;
		const text = toSlack(built).text as string;
		expect(text).toBe(
			`<${base}/7|🐞 Wokinu #7 · a ¦ b &lt;!here&gt;>\n&lt;!channel&gt; see &lt;https://evil.example|your invoice&gt; &amp; pay\n*Reporter:* &lt;@U123&gt;\n*Email:* x@example.com\n*Screen:* /`,
		);
	});

	it("never lets reporter text ping a Discord channel", () => {
		const built = describe_("message.created", {
			issue,
			message: {
				from: "reporter",
				body: "@everyone <@&123> look",
				author: { name: "@here", type: "reporter" },
			},
		}) as ChatMessage;
		const payload = toDiscord(built);
		expect(payload.allowed_mentions).toEqual({ parse: [] });
		expect(JSON.stringify(payload)).toContain("@everyone <@&123> look");
	});

	it("respects Discord's limits", () => {
		const embed = (
			toDiscord({
				...message,
				title: "t".repeat(300),
				text: "d".repeat(5000),
				fields: Array.from({ length: 30 }, (_, i) => [
					`f${i}`,
					"v".repeat(2000),
				]) as Array<[string, string]>,
			}).embeds as Array<{
				title: string;
				description: string;
				fields: Array<{ value: string }>;
			}>
		)[0];
		expect(embed?.title).toHaveLength(256);
		expect(embed?.description).toHaveLength(4000);
		expect(embed?.fields).toHaveLength(25);
		expect(embed?.fields[0]?.value).toHaveLength(1024);
	});
});
