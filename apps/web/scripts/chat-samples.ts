// Prints the Discord (or Slack) messages Tattle sends, built from realistic
// fake data, so a maintainer can look at them or post them to a test channel:
//
//   pnpm -s --filter web chat-samples                     every sample, EN and FR
//   pnpm -s --filter web chat-samples report.created fr   one payload, ready for curl
//   pnpm -s --filter web chat-samples report.created fr --slack
//
// Every title carries "(test)", in the project's name. The tests check these
// samples too: no secret may reach a message, whatever the event.

import { pathToFileURL } from "node:url";
import type { JsonObject } from "#/db/schema";
import { LOCALES, type Locale } from "#/i18n/locales";
import {
	type ChatProject,
	describeEvent,
	toDiscord,
	toSlack,
} from "#/server/chat-format";
import type { WebhookEvent } from "#/shared/issues";

export type ChatSample = {
	/** Unique per sample: "report.created", "report.created mobile"… */
	name: string;
	event: WebhookEvent | "ping";
	data: unknown;
};

export const SAMPLE_PROJECT: ChatProject = {
	id: "prj_sample",
	name: "Acme Shop (test)",
};

/**
 * Values that must never reach a channel. The samples carry them where a
 * careless formatter could pick them up: identify traits, extra report
 * fields, the reporter object.
 */
export const SAMPLE_SECRETS = [
	"uh_9c1f0e7a4b2d",
	"rk_5d8e2f1a9c7b",
	"tat_live_3e9a7c",
	"sess_44b1e0",
	"hunter2",
];

const issue = {
	number: 42,
	type: "bug" as const,
	title: 'Checkout fails when I tap "Pay"',
	status: "triage",
	priority: 0,
	labels: [] as string[],
	assignee: null,
	prUrl: null,
	reportCount: 1,
};

const webReport = {
	id: "rep_7Hq2xK",
	type: "bug",
	message:
		'Checkout fails when I tap "Pay"\nThe spinner turns for a few seconds, then nothing. My card was not charged. I tried twice, same thing.',
	pageUrl: "https://shop.example.com/checkout?step=payment",
	pageTitle: "Checkout · Acme Shop",
	release: "2026.11.3",
	reporter: {
		id: "usr_8f2k",
		name: "Camille Martin",
		email: "camille.martin@example.com",
		traits: {
			plan: "Pro",
			apiToken: SAMPLE_SECRETS[2],
			company: "Studio Nord",
			sessionId: SAMPLE_SECRETS[3],
			password: SAMPLE_SECRETS[4],
			signupDate: "2026-03-02",
		},
	},
	device: {
		browser: { name: "Chrome", version: "131.0.6778.86" },
		os: { name: "macOS", version: "15.1" },
		viewport: { width: 1440, height: 900 },
		language: "fr-FR",
	},
	// Never sent by Tattle in a webhook, here to prove the formatter ignores them.
	userHash: SAMPLE_SECRETS[0],
	reporterKey: SAMPLE_SECRETS[1],
	hasScreenshot: true,
	consoleErrors: 2,
	failedRequests: 1,
	createdAt: "2026-11-22T09:41:00.000Z",
};

const mobileReport = {
	id: "rep_Lm81vC",
	type: "feature",
	message:
		"Let me save my cart for later\nI often start an order on my phone and finish it on my laptop.",
	pageUrl: "CartScreen",
	pageTitle: "Cart",
	release: "3.2.0",
	reporter: { email: "sam.lee@example.com" },
	device: {
		platform: "android",
		manufacturer: "Samsung",
		model: "SM-S931B",
		os: { name: "Android", version: "15" },
		app: { name: "Acme", version: "3.2.0", build: "412" },
		viewport: { width: 412, height: 915 },
		language: "en-GB",
	},
	hasScreenshot: false,
	consoleErrors: 0,
	failedRequests: 0,
	createdAt: "2026-11-22T10:02:00.000Z",
};

export const CHAT_SAMPLES: ChatSample[] = [
	{
		name: "report.created",
		event: "report.created",
		data: {
			report: webReport,
			issue,
			duplicateSuggestion: {
				number: 38,
				title: "Payment button spins forever",
			},
		},
	},
	{
		name: "report.created mobile",
		event: "report.created",
		data: {
			report: mobileReport,
			issue: {
				...issue,
				number: 43,
				type: "feature",
				title: "Let me save my cart for later",
			},
		},
	},
	{
		name: "issue.created",
		event: "issue.created",
		data: {
			issue: {
				...issue,
				number: 44,
				title: "Retry failed card payments once",
				description:
					"Stripe answers 502 now and then. Retry once after 2 seconds before showing an error.\n\nSeen in #42 and #38.",
				status: "backlog",
				priority: 2,
				labels: ["payments", "web"],
			},
			actor: { type: "agent", id: "tok_1", name: "Triage bot" },
		},
	},
	{
		name: "issue.updated",
		event: "issue.updated",
		data: {
			issue: {
				...issue,
				status: "in_review",
				assignee: { type: "user", id: "u_1", name: "Lou Bernard" },
				prUrl: "https://github.com/acme/shop/pull/318",
			},
			changes: {
				status: { from: "in_progress", to: "in_review" },
				assigneeName: { from: null, to: "Lou Bernard" },
			},
			actor: { type: "user", id: "u_1", name: "Lou Bernard" },
		},
	},
	{
		name: "issue.updated merged",
		event: "issue.updated",
		data: {
			issue: { ...issue, number: 45, status: "duplicate" },
			changes: { status: { from: "triage", to: "duplicate" } },
			duplicateOf: issue,
			actor: { type: "user", id: "u_2", name: "Ada Moreau" },
		},
	},
	{
		name: "issue.updated regression",
		event: "issue.updated",
		data: {
			issue: { ...issue, status: "todo" },
			changes: { status: { from: "done", to: "todo" } },
			regression: { reportId: "rep_9", release: "2026.11.4" },
			actor: { type: "system", id: null, name: "Tattle" },
		},
	},
	{
		name: "comment.created",
		event: "comment.created",
		data: {
			issue,
			comment: {
				id: "c_1",
				body: "Reproduced on Chrome 131: the payment API answers 502.\nThe retry from #44 should fix it.",
				author: { type: "user", id: "u_1", name: "Lou Bernard" },
			},
			actor: { type: "user", id: "u_1", name: "Lou Bernard" },
		},
	},
	{
		name: "message.created from reporter",
		event: "message.created",
		data: {
			issue,
			report: {
				id: webReport.id,
				message: webReport.message,
				reporter: webReport.reporter,
			},
			message: {
				from: "reporter",
				body: "Still failing this morning, on my phone too.",
				author: { type: "reporter", id: null, name: "Camille Martin" },
			},
		},
	},
	{
		name: "message.created to reporter",
		event: "message.created",
		data: {
			issue,
			report: {
				id: webReport.id,
				message: webReport.message,
				reporter: webReport.reporter,
			},
			message: {
				from: "team",
				body: "Thanks Camille, we found the cause. A fix ships tomorrow.",
				author: { type: "user", id: "u_1", name: "Lou Bernard" },
			},
		},
	},
	{ name: "ping", event: "ping", data: null },
];

export const sampleMessage = (sample: ChatSample, locale: Locale) =>
	describeEvent(sample.event, SAMPLE_PROJECT, sample.data, locale);

const main = (args: string[]) => {
	process.env.BETTER_AUTH_URL ??= "https://tattle.example.com";
	const slack = args.includes("--slack");
	const [name, locale] = args.filter((arg) => !arg.startsWith("--"));
	const format = (message: NonNullable<ReturnType<typeof sampleMessage>>) =>
		slack ? toSlack(message) : toDiscord(message);

	if (name) {
		const sample = CHAT_SAMPLES.find((s) => s.name === name);
		const lang = (locale ?? "en") as Locale;
		const message = sample && sampleMessage(sample, lang);
		if (!message || !LOCALES.includes(lang)) {
			console.error(
				`Usage: chat-samples [<sample> [${LOCALES.join("|")}]] [--slack]\nSamples: ${CHAT_SAMPLES.map((s) => s.name).join(", ")}`,
			);
			process.exit(1);
		}
		console.log(JSON.stringify(format(message)));
		return;
	}
	for (const sample of CHAT_SAMPLES)
		for (const lang of LOCALES) {
			const message = sampleMessage(sample, lang);
			if (!message) continue;
			const payload: JsonObject = format(message);
			console.log(`# ${sample.name} (${lang})`);
			console.log(JSON.stringify(payload, null, 2));
			console.log();
		}
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	main(process.argv.slice(2));
