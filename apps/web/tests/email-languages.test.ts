import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { issueVote, project, report, user } from "#/db/schema";
import { auth } from "#/lib/auth";
import type { Actor } from "#/server/Access";
import { backgroundSettled } from "#/server/background";
import { Conversations } from "#/server/Conversations";
import * as fns from "#/server/fns";
import { Ingest } from "#/server/Ingest";
import { Issues } from "#/server/Issues";
import {
	captureMail,
	type Mail,
	mailHtml,
	mailText,
	stopCapturingMail,
} from "#/server/mailer";
import {
	addMember,
	createOrganization,
	createUser,
	createWorkspace,
	reportPayload,
	userActor,
} from "./helpers/factories";
import {
	requestContext,
	resetRequestContext,
	signInWith,
} from "./helpers/request-context";
import { run, setupTestDatabase } from "./helpers/runtime";
import { signedInMember } from "./helpers/session";

vi.mock("@tanstack/react-start", () => import("./helpers/start-mock"));
vi.mock("@tanstack/react-start/server", () => import("./helpers/start-mock"));

setupTestDatabase();

let outbox: Mail[];
beforeEach(() => {
	resetRequestContext();
	outbox = captureMail();
});
afterEach(async () => {
	await run(backgroundSettled);
	stopCapturingMail();
});

const sent = async () => {
	await run(backgroundSettled);
	return outbox;
};

/** A report from a device in `language`, with the reporter's email. */
const submit = (
	publicKey: string,
	language: string,
	type: "bug" | "feature" = "bug",
) =>
	run(
		Ingest.use((ingest) =>
			ingest.submit(
				reportPayload(publicKey, {
					type,
					message: "The export button is greyed out",
					reporter: { name: "Jo", email: "jo@example.com" },
					device: { language, os: { name: "macOS", version: "14.5" } },
				}),
				null,
			),
		),
	);

const setLanguage = (
	userId: string,
	locale: string | null,
	detectedLocale: string | null = null,
) => db.update(user).set({ locale, detectedLocale }).where(eq(user.id, userId));

describe("an email to a team member", () => {
	const assignTo = async (language: {
		locale: string | null;
		detected?: string | null;
	}) => {
		const { org, project: p } = await createWorkspace();
		const owner = await createUser({ name: "Olive Owner" });
		const member = await createUser({ name: "Mia Member" });
		await addMember(org.id, owner.id, "owner");
		await addMember(org.id, member.id, "member");
		await setLanguage(member.id, language.locale, language.detected ?? null);
		await submit(p.publicKey, "en-US");
		const actor: Actor = { type: "user", id: owner.id, name: owner.name };
		await run(
			Issues.use((issues) =>
				issues.update(
					p.id,
					1,
					{ assignee: { type: "user", id: member.id, name: member.name } },
					actor,
				),
			),
		);
		const mails = (await sent()).filter((m) => m.to === member.email);
		expect(mails).toHaveLength(1);
		return { mail: mails[0] as Mail, projectId: p.id };
	};

	it("is in English for someone who chose English", async () => {
		const { mail, projectId } = await assignTo({ locale: "en" });
		expect(mail).toMatchObject({
			locale: "en",
			subject: "Assigned to you: #1 The export button is greyed out",
			text: "Olive Owner assigned you #1 “The export button is greyed out” in Web app.",
			action: {
				label: "Open the issue",
				url: `http://localhost:3000/p/${projectId}/issues/1`,
			},
		});
		expect(mail.footer?.text).toBe(
			"You get this email because “Assigned to you” is on in your Tattle notification settings.",
		);
		const html = mailHtml(mail);
		expect(html).toContain('<html lang="en">');
		expect(html).toContain("Or open this link:");
	});

	it("is in French for someone who chose French, with every part translated", async () => {
		const { mail, projectId } = await assignTo({ locale: "fr" });
		expect(mail).toMatchObject({
			locale: "fr",
			subject: "Ticket assigné : #1 The export button is greyed out",
			text: "Olive Owner vous a assigné le ticket #1 « The export button is greyed out » dans Web app.",
			action: {
				label: "Ouvrir le ticket",
				url: `http://localhost:3000/p/${projectId}/issues/1`,
			},
		});
		expect(mail.footer?.text).toBe(
			"Vous recevez cet e-mail parce que « Un ticket vous est assigné » est activé dans vos réglages de notifications Tattle.",
		);
		expect(mail.footer?.links.map((l) => l.label)).toEqual([
			"Réglages des notifications",
			"Ne plus recevoir ces e-mails",
		]);
		const html = mailHtml(mail);
		expect(html).toContain('<html lang="fr">');
		expect(html).toContain("Ou ouvrez ce lien :");
		expect(mailText(mail)).toContain("Ouvrir le ticket: http://");
	});

	it("follows the browser's language for someone on Auto, else English", async () => {
		expect((await assignTo({ locale: null, detected: "fr" })).mail.locale).toBe(
			"fr",
		);
		expect((await assignTo({ locale: null })).mail.locale).toBe("en");
	});
});

describe("an email to someone who reported", () => {
	it("is in the language of the report's device", async () => {
		const { project: p } = await createWorkspace();
		const fr = await submit(p.publicKey, "fr-FR");
		const en = await submit(p.publicKey, "en-GB");
		const [stored] = await db
			.select({ locale: report.locale })
			.from(report)
			.where(eq(report.id, fr.id));
		expect(stored?.locale).toBe("fr");

		for (const sentReport of [fr, en])
			await run(
				Conversations.use((c) =>
					c.reply(p.id, sentReport.id, "Thanks, we're on it.", userActor),
				),
			);
		const mails = await sent();
		expect(mails).toHaveLength(2);
		const french = mails.find((m) => m.locale === "fr");
		const english = mails.find((m) => m.locale === "en");
		expect(french).toMatchObject({
			to: "jo@example.com",
			locale: "fr",
			subject: "Re : The export button is greyed out",
			text: "Bonjour Jo,\n\nAda, de Web app, a répondu à votre signalement :\n\nThanks, we're on it.\n\nVous aviez écrit : « The export button is greyed out »",
			action: { label: "Lire et répondre" },
			footer: {
				text: "Vous recevez cet e-mail parce que vous avez envoyé ce signalement.",
			},
		});
		expect(french?.footer?.links[0]?.label).toBe(
			"Ne plus recevoir d'e-mails sur ce signalement",
		);
		expect(english).toMatchObject({
			locale: "en",
			subject: "Re: The export button is greyed out",
			action: { label: "Read and reply" },
		});
		expect(english?.text).toMatch(/^Hi Jo,\n\nAda from Web app replied/);
	});

	it("is in English when the device gave no language we speak", async () => {
		const { project: p } = await createWorkspace();
		const sentReport = await submit(p.publicKey, "de-DE");
		await run(
			Conversations.use((c) =>
				c.reply(p.id, sentReport.id, "Danke!", userActor),
			),
		);
		expect((await sent())[0]?.locale).toBe("en");
	});

	it("tells reporters and voters a request shipped, each in their language", async () => {
		const { project: p } = await createWorkspace();
		await db
			.update(project)
			.set({ portalEnabled: true, portalSlug: "shop" })
			.where(eq(project.id, p.id));
		const sentReport = await submit(p.publicKey, "fr", "feature");
		const [row] = await db
			.select({ issueId: report.issueId })
			.from(report)
			.where(eq(report.id, sentReport.id));
		await db.insert(issueVote).values([
			{
				issueId: row?.issueId ?? "",
				voterKey: "voter-en",
				email: "en@example.com",
				locale: "en",
			},
			{
				issueId: row?.issueId ?? "",
				voterKey: "voter-fr",
				email: "fr@example.com",
				locale: "fr",
			},
		]);
		await run(
			Issues.use((issues) =>
				issues.update(p.id, 1, { status: "done" }, userActor),
			),
		);
		const shipped = Object.fromEntries(
			(await sent()).map((m) => [m.to, m] as const),
		);
		expect(shipped["jo@example.com"]?.subject).toBe(
			"Disponible : The export button is greyed out",
		);
		expect(shipped["jo@example.com"]?.text).toContain(
			"Vous aviez demandé « The export button is greyed out » à Web app.",
		);
		expect(shipped["fr@example.com"]?.subject).toBe(
			"Disponible : The export button is greyed out",
		);
		expect(shipped["en@example.com"]?.subject).toBe(
			"Shipped: The export button is greyed out",
		);
		// Each links to the portal at its language's address.
		expect(shipped["fr@example.com"]?.action?.url).toBe(
			"http://localhost:3000/fr/portal/shop?shipped=true",
		);
		expect(shipped["en@example.com"]?.action?.url).toBe(
			"http://localhost:3000/portal/shop?shipped=true",
		);
	});
});

describe("an invitation", () => {
	it("is in the inviter's language", async () => {
		const org = await createOrganization();
		const inviter = await signedInMember(org.id, "owner");
		await setLanguage(inviter.userId, "fr");
		signInWith(inviter.cookie);
		await fns.inviteMemberFn({
			data: {
				organizationId: org.id,
				email: "guest@example.com",
				role: "member",
			},
		});
		const [mail] = await sent();
		expect(mail?.locale).toBe("fr");
		expect(mail?.subject).toMatch(/vous invite dans .* sur Tattle$/);
		expect(mail?.action?.label).toBe("Accepter l'invitation");
	});

	it("follows the inviter's browser when they kept Auto", async () => {
		const org = await createOrganization();
		signInWith((await signedInMember(org.id, "owner")).cookie);
		requestContext.headers.set("accept-language", "fr-FR");
		await fns.inviteMemberFn({
			data: {
				organizationId: org.id,
				email: "guest@example.com",
				role: "member",
			},
		});
		expect((await sent())[0]?.locale).toBe("fr");
	});
});

describe("a password reset", () => {
	it("is in the person's language", async () => {
		const person = await createUser({ name: "Mia" });
		await setLanguage(person.id, "fr");
		await auth.api.requestPasswordReset({
			body: { email: person.email, redirectTo: "/reset-password" },
		});
		const [mail] = await sent();
		expect(mail).toMatchObject({
			to: person.email,
			locale: "fr",
			subject: "Réinitialisez votre mot de passe Tattle",
			action: { label: "Choisir un nouveau mot de passe" },
		});
		expect(mail?.text).toMatch(/^Bonjour Mia,/);
	});
});
