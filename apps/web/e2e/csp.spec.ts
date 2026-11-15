/**
 * A customer's site with a strict Content-Security-Policy, extended as the
 * widget's README says: the widget loads, captures the page and sends the
 * report, and the browser reports no violation.
 */
import { expect, test } from "./support/fixtures.ts";
import { unique } from "./support/seed.ts";

test("the widget works under the Content-Security-Policy its README documents", async ({
	workspace,
	openSite,
	dashboard,
}) => {
	const site = await openSite({
		publicKey: workspace.project.publicKey,
		strictCsp: true,
	});
	const violations: string[] = [];
	await site.exposeFunction("reportViolation", (text: string) =>
		violations.push(text),
	);
	await site.evaluate(() =>
		document.addEventListener("securitypolicyviolation", (event) =>
			(
				window as unknown as { reportViolation: (t: string) => void }
			).reportViolation(`${event.violatedDirective} ${event.blockedURI}`),
		),
	);
	const message = `Coupon field rejects lowercase codes ${unique("csp")}`;
	const widget = site.getByRole("dialog", { name: "Send feedback" });

	await site.getByRole("button", { name: "Send feedback" }).click();
	await expect(widget).toBeVisible();
	await widget.getByRole("button", { name: "Capture the screen" }).click();
	const editor = site.getByRole("dialog", { name: "Annotate screenshot" });
	await expect(editor).toBeVisible();
	await editor.getByRole("button", { name: "Done" }).click();
	await expect(
		widget.getByRole("img", { name: "Annotated screenshot" }),
	).toBeVisible();
	await widget.getByRole("textbox", { name: "What went wrong?" }).fill(message);
	await widget.getByRole("button", { name: "Send" }).click();
	await expect(widget.getByText("Thanks! We got it.")).toBeVisible();

	// Its Shadow DOM stylesheet applied: the panel has its background.
	expect(
		await widget.evaluate((el) => getComputedStyle(el).backgroundColor),
	).not.toBe("rgba(0, 0, 0, 0)");
	expect(violations).toEqual([]);

	// The report arrived, with its screenshot.
	await dashboard.goto(`/p/${workspace.project.id}/triage`);
	const item = dashboard
		.getByRole("region", { name: "Reports waiting for a decision" })
		.getByRole("link", { name: new RegExp(message) });
	await expect(item).toBeVisible();
	await expect(
		item.getByRole("img", { name: "Has a screenshot" }),
	).toBeVisible();
});
