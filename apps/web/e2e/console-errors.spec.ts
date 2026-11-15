/**
 * The dashboard's pages load without a single error in the browser console,
 * with the server (UTC) and the browser (Europe/Paris) in different time
 * zones: a date or time the server renders differently from the browser
 * breaks hydration (React error #418), and an invalid `pattern` attribute
 * makes Chrome log an error and skip the field's check.
 */
import type { Page } from "@playwright/test";
import { expect, sendReport, test } from "./support/fixtures.ts";
import { db } from "./support/seed.ts";

/** "Nov 3", as the browser (Europe/Paris) reads it. */
const parisDay = (date: Date) =>
	new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		timeZone: "Europe/Paris",
	}).format(date);

/** Every console error and uncaught exception of the page, from now on. */
const collectErrors = (page: Page) => {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));
	return errors;
};

/**
 * Moves a report and its issue back in time. The columns hold UTC times
 * without a zone: the date goes as an ISO string, not as a Date, which pg
 * would write in this machine's time zone.
 */
const backdate = async (reportId: string, date: Date, status?: string) => {
	await db().query("update report set created_at = $2 where id = $1", [
		reportId,
		date.toISOString(),
	]);
	await db().query(
		`update issue set created_at = $2, updated_at = $2, status = coalesce($3, status)
		 where id = (select issue_id from report where id = $1)`,
		[reportId, date.toISOString(), status ?? null],
	);
};

test("the issue, triage and settings pages log no console error", async ({
	workspace,
	dashboard,
	request,
}) => {
	const { project } = workspace;
	const errors = collectErrors(dashboard);
	// Two hours ago: far from any relative-time boundary ("2 hours ago").
	const at = Date.now() - 2 * 60 * 60 * 1000;
	const report = await sendReport(request, project.publicKey, {
		message: "Checkout button does nothing",
		reporter: { email: "clock@example.test", name: "Clock" },
		release: "2.1.0",
		breadcrumbs: [
			{ category: "navigation", message: "/cart", timestamp: at },
			{ category: "click", message: "button “Pay now”", timestamp: at + 4000 },
		],
		console: [
			{ level: "error", message: "Payment failed", timestamp: at + 5000 },
		],
	});
	await backdate(report.id, new Date(at + 6000));

	// An issue accepted three days ago at 23:30 UTC: already the next day in
	// Paris, so a date formatted in the server's time zone shows another day.
	const today = new Date();
	const lateNight = new Date(
		Date.UTC(
			today.getUTCFullYear(),
			today.getUTCMonth(),
			today.getUTCDate() - 3,
			23,
			30,
		),
	);
	const late = await sendReport(request, project.publicKey, {
		message: "Invoice totals are rounded twice",
	});
	await backdate(late.id, lateNight, "backlog");

	await test.step("triage, with the report selected", async () => {
		await dashboard.goto(`/p/${project.id}/triage`);
		await expect(
			dashboard
				.getByRole("region", { name: "Selected report" })
				.getByRole("heading", { name: "Checkout button does nothing" }),
		).toBeVisible();
		await expect(
			dashboard
				.getByRole("region", { name: "Recently decided" })
				.getByRole("link", { name: /Invoice totals are rounded twice/ }),
		).toContainText(parisDay(lateNight));
		expect(errors).toEqual([]);
	});

	await test.step("the issue, its steps and console with their times", async () => {
		await dashboard.goto(`/p/${project.id}/issues/${report.issueNumber}`);
		const logs = dashboard.getByRole("region", { name: "Logs and context" });
		// Times read in the browser's time zone (Paris is UTC+1 or UTC+2).
		const local = (timestamp: number) =>
			new Intl.DateTimeFormat("en-GB", {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				timeZone: "Europe/Paris",
			}).format(timestamp);
		await expect(
			logs.getByRole("list", { name: "Steps before the report" }),
		).toContainText(local(at));
		await logs.getByRole("tab", { name: /^Console/ }).click();
		await expect(logs.getByRole("tabpanel")).toContainText(local(at + 5000));
		await expect(dashboard.getByText("2 hours ago").first()).toBeVisible();
		expect(errors).toEqual([]);
	});

	await test.step("the issue list, with the day in Paris", async () => {
		await dashboard.goto(`/p/${project.id}/issues`);
		// Only accepted issues are listed: the one still in Triage is not.
		await expect(
			dashboard.getByRole("link", { name: /Invoice totals are rounded twice/ }),
		).toContainText(parisDay(lateNight));
		expect(errors).toEqual([]);
	});

	await test.step("project settings; the browser checks the address", async () => {
		await dashboard.goto(`/p/${project.id}/settings`);
		const address = dashboard
			.getByRole("region", { name: "Public feature requests" })
			.getByLabel("Address");
		await address.fill("-not-an-address");
		expect(
			await address.evaluate(
				(input: HTMLInputElement) => input.validity.patternMismatch,
			),
		).toBe(true);
		await address.fill("shop-ideas");
		expect(
			await address.evaluate((input: HTMLInputElement) => input.validity.valid),
		).toBe(true);
		expect(errors).toEqual([]);
	});
});
