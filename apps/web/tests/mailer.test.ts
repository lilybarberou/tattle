import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Nodemailer is replaced by a recorder: no SMTP connection is ever opened.
const smtp = vi.hoisted(() => ({
	transports: [] as Record<string, unknown>[],
	sent: [] as Record<string, unknown>[],
	fail: null as Error | null,
}));

vi.mock("nodemailer", () => ({
	default: {
		createTransport: (options: Record<string, unknown>) => {
			smtp.transports.push(options);
			return {
				sendMail: async (message: Record<string, unknown>) => {
					if (smtp.fail) throw smtp.fail;
					smtp.sent.push(message);
					return { messageId: "test" };
				},
			};
		},
	},
}));

type MailerModule = typeof import("#/server/mailer");
let mailer: MailerModule;

beforeEach(async () => {
	smtp.transports.length = 0;
	smtp.sent.length = 0;
	smtp.fail = null;
	vi.stubEnv("SMTP_HOST", "smtp.example.invalid");
	vi.stubEnv("SMTP_FROM", "Tattle <tattle@example.org>");
	// A fresh module: the transporter is built once per process.
	vi.resetModules();
	mailer = await import("#/server/mailer");
});
afterEach(() => vi.unstubAllEnvs());

const lastSent = () => smtp.sent.at(-1) as { html: string; text: string };

describe("sendMail", () => {
	it("sends through SMTP with the configured sender", async () => {
		vi.stubEnv("SMTP_USER", "mailer");
		vi.stubEnv("SMTP_PASSWORD", "secret");
		expect(
			await mailer.sendMail({
				to: "ada@example.com",
				subject: "Hello",
				text: "Hi",
				headers: { "List-Unsubscribe": "<https://x.example/u>" },
			}),
		).toBe(true);
		expect(smtp.transports).toEqual([
			expect.objectContaining({
				host: "smtp.example.invalid",
				port: 587,
				secure: false,
				auth: { user: "mailer", pass: "secret" },
				connectionTimeout: 15_000,
				greetingTimeout: 15_000,
				socketTimeout: 30_000,
			}),
		]);
		expect(smtp.sent[0]).toMatchObject({
			from: "Tattle <tattle@example.org>",
			to: "ada@example.com",
			subject: "Hello",
			headers: { "List-Unsubscribe": "<https://x.example/u>" },
		});
	});

	it("uses TLS on port 465 unless SMTP_SECURE says otherwise, and builds the transporter once", async () => {
		vi.stubEnv("SMTP_PORT", "465");
		await mailer.sendMail({ to: "a@example.com", subject: "1", text: "x" });
		await mailer.sendMail({ to: "b@example.com", subject: "2", text: "x" });
		expect(smtp.transports).toHaveLength(1);
		expect(smtp.transports[0]).toMatchObject({ port: 465, secure: true });
		expect(smtp.transports[0]?.auth).toBeUndefined();

		vi.resetModules();
		mailer = await import("#/server/mailer");
		vi.stubEnv("SMTP_SECURE", "false");
		await mailer.sendMail({ to: "a@example.com", subject: "1", text: "x" });
		expect(smtp.transports[1]).toMatchObject({ port: 465, secure: false });
	});

	it("falls back to SMTP_USER as the sender", async () => {
		vi.stubEnv("SMTP_FROM", undefined);
		vi.stubEnv("SMTP_USER", "bot@example.org");
		await mailer.sendMail({ to: "a@example.com", subject: "1", text: "x" });
		expect(smtp.sent[0]?.from).toBe("bot@example.org");
	});

	it("sends nothing and says false without SMTP_HOST", async () => {
		vi.stubEnv("SMTP_HOST", "");
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		expect(mailer.mailEnabled()).toBe(false);
		expect(
			await mailer.sendMail({
				to: "a@example.com",
				subject: "Reset your password",
				text: "https://tattle.example/reset?token=secret",
			}),
		).toBe(false);
		expect(smtp.transports).toEqual([]);
		// The log line never carries the link, the subject or the address.
		const logged = info.mock.calls.flat().join(" ");
		expect(logged).not.toContain("secret");
		expect(logged).not.toContain("a@example.com");
		expect(logged).not.toContain("Reset");
		info.mockRestore();
	});

	it("refuses anything but one plain address", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		for (const to of [
			"a@example.com, b@example.com",
			"a@example.com;b@example.com",
			'"Ada" <a@example.com>',
			"a@example.com\r\nBcc: b@example.com",
			"no-at-sign",
			"@example.com",
			"a@localhost",
			`${"a".repeat(320)}@example.com`,
		]) {
			expect(await mailer.sendMail({ to, subject: "x", text: "x" }), to).toBe(
				false,
			);
		}
		expect(smtp.sent).toEqual([]);
		expect(warn.mock.calls.flat().join(" ")).not.toContain("b@example.com");
		warn.mockRestore();
	});

	it("lets SMTP errors reach the caller", async () => {
		smtp.fail = new Error("EAUTH");
		await expect(
			mailer.sendMail({ to: "a@example.com", subject: "x", text: "x" }),
		).rejects.toThrow("EAUTH");
	});
});

describe("the message's HTML and text", () => {
	it("escapes what reporters and members wrote", async () => {
		await mailer.sendMail({
			to: "a@example.com",
			subject: "x",
			text: 'Hi <script>alert("x")</script> & bye\nsecond line\n\nNew paragraph',
			lists: [
				{
					title: "<b>Issues</b>",
					url: 'https://x.example/"onmouseover="alert(1)',
					items: [
						{
							label: "<img src=x onerror=alert(1)>",
							url: "https://x.example/1",
						},
					],
					more: "and <2> more",
				},
			],
			action: { label: "Open <it>", url: 'https://x.example/?a=1&b="2"' },
			footer: {
				text: "Why <you>",
				links: [{ label: "Stop", url: "https://x.example/stop" }],
			},
		});
		const { html } = lastSent();
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img");
		expect(html).not.toContain("<b>Issues");
		expect(html).not.toContain('"onmouseover');
		expect(html).toContain(
			"Hi &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; bye<br>second line",
		);
		expect(html.match(/<p style="margin:0 0 16px/g)).toHaveLength(2);
		expect(html).toContain("&lt;b&gt;Issues&lt;/b&gt;");
		expect(html).toContain("and &lt;2&gt; more");
		expect(html).toContain('href="https://x.example/?a=1&amp;b=&quot;2&quot;"');
		expect(html).toContain("Why &lt;you&gt;");
	});

	it("writes the links out in the plain text version", async () => {
		await mailer.sendMail({
			to: "a@example.com",
			subject: "Digest",
			text: "Your day",
			lists: [
				{
					title: "Web app",
					url: "https://x.example/p",
					items: [{ label: "#1 Broken", url: "https://x.example/p/1" }],
					more: "and 3 more",
				},
				{ title: "No link", items: [] },
			],
			action: { label: "Open Triage", url: "https://x.example/t" },
			footer: {
				text: "You get this because…",
				links: [{ label: "Unsubscribe", url: "https://x.example/u" }],
			},
		});
		expect(lastSent().text).toBe(
			[
				"Your day",
				"Web app: https://x.example/p\n- #1 Broken: https://x.example/p/1\n  and 3 more",
				"No link",
				"Open Triage: https://x.example/t",
				"-- \nYou get this because…\nUnsubscribe: https://x.example/u",
			].join("\n\n"),
		);
	});
});

describe("isSingleAddress", () => {
	it("accepts ordinary addresses", () => {
		for (const to of [
			"ada@example.com",
			"ada.lovelace+tattle@mail.example.org",
			"o'brien@example.com",
		]) {
			expect(mailer.isSingleAddress(to), to).toBe(true);
		}
	});
});
