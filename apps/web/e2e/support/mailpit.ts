/**
 * The emails the app sent, read from the local Mailpit
 * (e2e/docker-compose.e2e.yml). Tests look emails up by recipient, which is
 * unique per test.
 */
import { expect } from "@playwright/test";
import { MAILPIT_URL } from "../config.ts";

type Summary = { ID: string; Subject: string; To: { Address: string }[] };
export type Email = { subject: string; text: string; html: string };

async function search(to: string): Promise<Summary[]> {
	const response = await fetch(
		`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
	);
	if (!response.ok)
		throw new Error(`Mailpit search failed: ${response.status}`);
	const body = (await response.json()) as { messages: Summary[] };
	return body.messages;
}

/** Waits for an email to `to` whose subject matches, and returns it. */
export async function waitForEmail(
	to: string,
	subject: RegExp,
	timeout = 15_000,
): Promise<Email> {
	let found: Summary | undefined;
	await expect
		.poll(
			async () => {
				found = (await search(to)).find((m) => subject.test(m.Subject));
				return Boolean(found);
			},
			{ timeout, message: `an email to ${to} matching ${subject}` },
		)
		.toBe(true);
	const id = (found as Summary).ID;
	const response = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
	const message = (await response.json()) as {
		Subject: string;
		Text: string;
		HTML: string;
	};
	return { subject: message.Subject, text: message.Text, html: message.HTML };
}

/** Every email sent to `to` so far. */
export async function emailsTo(to: string) {
	return (await search(to)).map((m) => m.Subject);
}

/** The first link in an email whose address starts with `prefix`. */
export function linkIn(email: Email, prefix: string) {
	const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = `${email.text}\n${email.html}`.match(
		new RegExp(`${escaped}[^\\s"'<>)\\]]*`),
	);
	if (!match) throw new Error(`No link to ${prefix} in "${email.subject}"`);
	return match[0].replace(/&amp;/g, "&");
}
