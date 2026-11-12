import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing email over SMTP, configured from the environment:
 * SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASSWORD,
 * SMTP_SECURE (true for port 465), SMTP_FROM ("Tattle <tattle@example.org>").
 *
 * Without SMTP_HOST nothing is sent: callers fall back to links shown in the
 * dashboard, and the message is printed to the server log instead.
 */
export const mailEnabled = () =>
	outbox !== null || Boolean(process.env.SMTP_HOST);

// Tests: messages kept in memory instead of SMTP (see captureMail).
let outbox: Mail[] | null = null;

/**
 * For tests: from now on, messages are appended to the returned array instead
 * of being sent, and `mailEnabled()` is true as if SMTP were set.
 */
export const captureMail = (): Mail[] => {
	outbox = [];
	return outbox;
};

/** For tests: back to the environment's SMTP settings. */
export const stopCapturingMail = () => {
	outbox = null;
};

let transporter: Transporter | null = null;
const getTransporter = () => {
	if (transporter) return transporter;
	const port = Number(process.env.SMTP_PORT ?? 587);
	transporter = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port,
		secure: process.env.SMTP_SECURE
			? process.env.SMTP_SECURE === "true"
			: port === 465,
		auth: process.env.SMTP_USER
			? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
			: undefined,
	});
	return transporter;
};

export type Mail = {
	to: string;
	subject: string;
	/** Plain-text body; the HTML version is built from it. */
	text: string;
	/** Lists of links after the text, e.g. issues in a digest. */
	lists?: Array<{
		title: string;
		url?: string;
		items: Array<{ label: string; url: string }>;
		more?: string;
	}>;
	/** A button under the text, also written out as a plain link. */
	action?: { label: string; url: string };
	/** Small print under the message: why it was sent, and links to stop it. */
	footer?: { text: string; links: Array<{ label: string; url: string }> };
	/** Extra headers, e.g. List-Unsubscribe. */
	headers?: Record<string, string>;
};

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"]/g,
		(c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`,
	);

const link = (label: string, url: string, style = "color:#131416") =>
	`<a href="${escapeHtml(url)}" style="${style}">${escapeHtml(label)}</a>`;

const html = (mail: Mail) => `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f4f6f8;font-family:-apple-system,'Segoe UI',sans-serif;color:#131416">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e8eaec;border-radius:12px;padding:28px">
${mail.text
	.split("\n\n")
	.map(
		(p) =>
			`<p style="margin:0 0 16px;font-size:15px;line-height:22px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
	)
	.join("\n")}
${(mail.lists ?? [])
	.map(
		(list) =>
			`<p style="margin:0 0 6px;font-size:15px;line-height:22px;font-weight:600">${list.url ? link(list.title, list.url) : escapeHtml(list.title)}</p>
<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:22px">
${list.items.map((item) => `<li>${link(item.label, item.url)}</li>`).join("\n")}${list.more ? `\n<li style="list-style:none;color:#5d5f60">${escapeHtml(list.more)}</li>` : ""}
</ul>`,
	)
	.join("\n")}
${
	mail.action
		? `<p style="margin:24px 0 8px"><a href="${escapeHtml(mail.action.url)}" style="display:inline-block;background:#1d1f20;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;font-weight:600">${escapeHtml(mail.action.label)}</a></p>
<p style="margin:0;font-size:12px;line-height:18px;color:#5d5f60">Or open this link: ${escapeHtml(mail.action.url)}</p>`
		: ""
}
</div>
${
	mail.footer
		? `<p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:18px;color:#5d5f60">${escapeHtml(mail.footer.text)}<br>${mail.footer.links.map((l) => link(l.label, l.url, "color:#5d5f60")).join(" · ")}</p>`
		: ""
}
</body></html>`;

const plainText = (mail: Mail) => {
	const parts = [mail.text];
	for (const list of mail.lists ?? []) {
		const lines = [list.url ? `${list.title}: ${list.url}` : list.title];
		for (const item of list.items) lines.push(`- ${item.label}: ${item.url}`);
		if (list.more) lines.push(`  ${list.more}`);
		parts.push(lines.join("\n"));
	}
	if (mail.action) parts.push(`${mail.action.label}: ${mail.action.url}`);
	if (mail.footer)
		parts.push(
			[
				"-- ",
				mail.footer.text,
				...mail.footer.links.map((l) => `${l.label}: ${l.url}`),
			].join("\n"),
		);
	return parts.join("\n\n");
};

/** Sends a message; returns false (and logs it) when SMTP is not configured. */
export async function sendMail(mail: Mail): Promise<boolean> {
	if (outbox) {
		outbox.push(mail);
		return true;
	}
	if (!mailEnabled()) {
		console.info(
			`[mail] SMTP is not configured, not sending "${mail.subject}" to ${mail.to}.${mail.action ? ` Link: ${mail.action.url}` : ""}`,
		);
		return false;
	}
	await getTransporter().sendMail({
		from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
		to: mail.to,
		subject: mail.subject,
		text: plainText(mail),
		html: html(mail),
		headers: mail.headers,
	});
	return true;
}
