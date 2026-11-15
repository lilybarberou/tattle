/**
 * Webhooks, delivered to the fixtures server on this machine (the app runs
 * with ALLOW_PRIVATE_URLS=true for that): added from project settings, each
 * event signed with the endpoint's secret, filtered by event, and listed in
 * "Recent deliveries".
 */
import { createHmac } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { RECEIVER_URL } from "./config.ts";
import { expect, sendReport, test } from "./support/fixtures.ts";
import { unique } from "./support/seed.ts";

type Delivery = {
	headers: Record<string, string>;
	body: string;
};

const received = async (request: APIRequestContext, box: string) =>
	(await (await request.get(`${RECEIVER_URL}/${box}`)).json()) as Delivery[];

const events = async (request: APIRequestContext, box: string) =>
	(await received(request, box)).map((d) => d.headers["x-tattle-event"]);

const verify = (secret: string, delivery: Delivery) => {
	const header = delivery.headers["x-tattle-signature"] ?? "";
	const { t, v1 } = Object.fromEntries(
		header.split(",").map((part) => part.split("=") as [string, string]),
	);
	const expected = createHmac("sha256", secret)
		.update(`${t}.${delivery.body}`)
		.digest("hex");
	return v1 === expected && Math.abs(Date.now() / 1000 - Number(t ?? 0)) < 300;
};

test("webhooks receive signed events for the triage of a report, filtered by event", async ({
	workspace,
	dashboard,
	request,
	a11y,
}) => {
	const { project } = workspace;
	const everything = unique("all");
	const commentsOnly = unique("comments");
	const settings = dashboard.getByRole("region", { name: "Webhooks" });
	// One endpoint's card: the innermost block with its URL and its secret.
	const card = (box: string) =>
		settings
			.locator("div")
			.filter({ has: dashboard.getByText(`${RECEIVER_URL}/${box}`) })
			.filter({
				has: dashboard.getByRole("button", { name: "Copy: Signing secret" }),
			})
			.last();

	let secret = "";
	await test.step("add an endpoint for every event, and one for comments only", async () => {
		await dashboard.goto(`/p/${project.id}/settings`);
		await settings
			.getByLabel("Add an endpoint")
			.fill(`${RECEIVER_URL}/${everything}`);
		await settings.getByRole("button", { name: "Add webhook" }).click();
		await expect(dashboard.getByText("Webhook added")).toBeVisible();
		await expect(card(everything)).toContainText("Every event");
		// The signing secret, under the "Signing secret" label.
		secret =
			(await card(everything).locator("pre").textContent())?.trim() ?? "";
		expect(secret.length).toBeGreaterThan(16);

		await settings
			.getByLabel("Add an endpoint")
			.fill(`${RECEIVER_URL}/${commentsOnly}`);
		await settings.getByRole("checkbox", { name: /^comment\.created/ }).click();
		await settings.getByRole("button", { name: "Add webhook" }).click();
		await expect(card(commentsOnly)).toContainText("comment.created");
		await a11y(dashboard, "project settings (webhooks)");
	});

	await test.step("send a test reaches the receiver", async () => {
		await card(everything).getByRole("button", { name: "Send a test" }).click();
		await expect(
			dashboard.getByText("Ping delivered (HTTP 200)"),
		).toBeVisible();
		await expect.poll(() => events(request, everything)).toContain("ping");
	});

	await test.step("a report, its triage, a comment and a reply are each delivered", async () => {
		const report = await sendReport(request, project.publicKey, {
			message: "Newsletter signup button does nothing",
			reporter: { email: `${unique("nina")}@example.test`, name: "Nina" },
		});
		await expect
			.poll(() => events(request, everything))
			.toEqual(expect.arrayContaining(["report.created", "issue.created"]));

		await dashboard.goto(`/p/${project.id}/triage`);
		await dashboard
			.getByRole("region", { name: "Selected report" })
			.getByRole("button", { name: /^Accept/ })
			.click();
		await expect(
			dashboard.getByText(`#${report.issueNumber} accepted into Backlog`),
		).toBeVisible();
		await expect
			.poll(() => events(request, everything))
			.toContain("issue.updated");

		await dashboard.goto(`/p/${project.id}/issues/${report.issueNumber}`);
		const activity = dashboard.getByRole("region", { name: "Activity" });
		await activity
			.getByRole("textbox", { name: "Comment" })
			.fill("Looking into it");
		await activity.getByRole("button", { name: /^Comment/ }).click();
		await expect(activity.getByRole("list")).toContainText("Looking into it");
		const conversation = dashboard.getByRole("region", {
			name: "Conversation with Nina",
		});
		await conversation
			.getByRole("textbox", { name: "Reply to Nina" })
			.fill("Thanks Nina, fixed in the next release.");
		await conversation
			.getByRole("button", { name: "Reply to reporter" })
			.click();
		await expect(conversation).toContainText("fixed in the next release");

		await expect
			.poll(() => events(request, everything))
			.toEqual(expect.arrayContaining(["comment.created", "message.created"]));
	});

	await test.step("every delivery is signed with the endpoint's secret", async () => {
		const all = await received(request, everything);
		for (const delivery of all) {
			expect(verify(secret, delivery), delivery.headers["x-tattle-event"]).toBe(
				true,
			);
			expect(delivery.headers["x-tattle-delivery"]).toBeTruthy();
		}
		const updated = all.find(
			(d) => d.headers["x-tattle-event"] === "issue.updated",
		);
		expect(JSON.parse(updated?.body ?? "{}")).toMatchObject({
			event: "issue.updated",
		});
		expect(updated?.body).toContain("backlog");
		const message = all.find(
			(d) => d.headers["x-tattle-event"] === "message.created",
		);
		expect(message?.body).toContain('"from":"team"');
	});

	await test.step("the filtered endpoint only got comments", async () => {
		await expect
			.poll(() => events(request, commentsOnly))
			.toEqual(["comment.created"]);
	});

	await test.step("recent deliveries are listed, and an endpoint can be deleted", async () => {
		await dashboard.goto(`/p/${project.id}/settings`);
		await expect(settings.getByRole("table")).toContainText("comment.created");
		await card(commentsOnly)
			.getByRole("button", { name: "Delete this webhook" })
			.click();
		await expect(dashboard.getByText("Webhook deleted")).toBeVisible();
		await expect(
			settings.getByText(`${RECEIVER_URL}/${commentsOnly}`),
		).toHaveCount(0);
	});
});
