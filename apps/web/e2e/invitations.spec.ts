/**
 * Joining a workspace. Sign-up is closed, so an invitation is the only way
 * in, and only its signed link counts: knowing the invited email is not
 * enough to create that account or to take that seat, and signing in no
 * longer accepts invitations by email.
 */
import { PASSWORD } from "./config.ts";
import { expect, test } from "./support/fixtures.ts";
import { linkIn, waitForEmail } from "./support/mailpit.ts";
import { addMember, seedUser, seedWorkspace, unique } from "./support/seed.ts";

const invite = async (
	page: import("@playwright/test").Page,
	email: string,
	role: "Member" | "Admin",
) => {
	await page.goto("/members");
	const form = page.getByRole("region", { name: "Invite someone" });
	await form.getByLabel("Email").fill(email);
	await form.getByRole("button", { name: role, exact: true }).click();
	await expect(
		form.getByRole("button", { name: role, exact: true }),
	).toHaveAttribute("aria-pressed", "true");
	await form.getByRole("button", { name: "Create invitation" }).click();
	await expect(page.getByText("Invitation sent by email")).toBeVisible();
	await expect(form.getByText("Waiting to join")).toBeVisible();
	await expect(
		form.getByRole("listitem").filter({ hasText: email }),
	).toContainText(role);
	const sent = await waitForEmail(email, /invited you to/);
	return linkIn(sent, "http://localhost:3100/login?");
};

test("an invited person creates their account from the emailed link and joins as admin", async ({
	dashboard,
	freshPage,
	a11y,
}) => {
	const email = `${unique("camille")}@example.test`;
	const link = await invite(dashboard, email, "Admin");
	expect(link).toContain(`email=${encodeURIComponent(email)}`);
	expect(link).toMatch(/invite=[\w-]+\.[\w-]+/);
	await a11y(dashboard, "members");

	const page = await freshPage();
	await page.goto(link);
	await expect(
		page.getByRole("heading", { name: "Create your account" }),
	).toBeVisible();
	await expect(page.getByText(`You were invited as ${email}.`)).toBeVisible();
	await expect(page.getByLabel("Email")).toHaveValue(email);
	await a11y(page, "login (invited)");

	await page.getByLabel("Name").fill("Camille");
	await page.getByLabel("Password").fill(PASSWORD);
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page).toHaveURL(/\/p\/[\w-]+\/triage/);

	await page.goto("/members");
	const people = page.getByRole("region", { name: "People" });
	await expect(
		people.getByRole("listitem").filter({ hasText: email }),
	).toContainText("Admin");
	// Admins can invite in turn.
	await expect(
		page.getByRole("button", { name: "Create invitation" }),
	).toBeVisible();

	// The invitation is used up: it no longer waits, and its link no longer
	// creates an account.
	await dashboard.reload();
	await expect(
		dashboard.getByRole("region", { name: "Invite someone" }),
	).not.toContainText(email);
	await expect(dashboard.getByRole("region", { name: "People" })).toContainText(
		email,
	);

	const replay = await freshPage();
	await replay.goto(link);
	await expect(replay.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("the invited email alone, or a forged link, cannot create the account", async ({
	dashboard,
	freshPage,
}) => {
	const email = `${unique("target")}@example.test`;
	const link = await invite(dashboard, email, "Admin");
	const token = new URL(link).searchParams.get("invite") ?? "";

	const page = await freshPage();

	await test.step("without the token, the login page only offers sign-in", async () => {
		await page.goto(`/login?email=${encodeURIComponent(email)}`);
		await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
		await expect(
			page.getByText(
				"Accounts are created by invitation. Ask a member of your team.",
			),
		).toBeVisible();
	});

	await test.step("a token signed by someone else is worthless", async () => {
		const [id] = token.split(".");
		await page.goto(
			`/login?email=${encodeURIComponent(email)}&invite=${id}.forged-signature`,
		);
		await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
	});

	await test.step("the real token with another email is refused by the server", async () => {
		await page.goto(link);
		await expect(
			page.getByRole("heading", { name: "Create your account" }),
		).toBeVisible();
		await page.getByLabel("Name").fill("Mallory");
		await page.getByLabel("Email").fill(`${unique("mallory")}@example.test`);
		await page.getByLabel("Password").fill(PASSWORD);
		await page.getByRole("button", { name: "Create account" }).click();
		await expect(
			page.getByText(/Sign-up is closed on this server/),
		).toBeVisible();
		await expect(page).toHaveURL(/\/login/);
	});

	await test.step("an API call without the token is refused too", async () => {
		const response = await page.request.post("/api/auth/sign-up/email", {
			data: { email, password: PASSWORD, name: "Mallory" },
			headers: { origin: "http://localhost:3100" },
		});
		expect(response.status()).toBe(403);
	});

	await test.step("the seat is still waiting for the real person", async () => {
		await dashboard.reload();
		await expect(
			dashboard.getByRole("region", { name: "Invite someone" }),
		).toContainText(email);
		await expect(
			dashboard.getByRole("region", { name: "People" }),
		).not.toContainText(email);
	});
});

test("someone who already has an account joins only by opening the link", async ({
	workspace,
	dashboard,
	signedInPage,
}) => {
	// They own another workspace on this server already.
	const elsewhere = await seedWorkspace({
		ownerName: "Bruno",
		projectName: "Elsewhere",
	});
	const bruno = elsewhere.owner;
	const link = await invite(dashboard, bruno.email, "Member");
	const page = await signedInPage(bruno);
	const target = `/p/${workspace.project.id}/triage`;

	await test.step("signing in with the invited email does not join", async () => {
		await page.goto(target);
		await expect(
			page.getByRole("heading", { name: /^Triage/ }),
		).not.toBeVisible();
		// Someone else's project looks like a missing page.
		await expect(
			page.getByRole("heading", { name: "This page doesn't exist" }),
		).toBeVisible();
	});

	await test.step("opening the link while signed in joins the workspace", async () => {
		await page.goto(link);
		await expect(page).toHaveURL(/\/p\/[\w-]+\/triage/);
		await page.goto(target);
		await expect(page.getByRole("heading", { name: /^Triage/ })).toBeVisible();
		await page.goto("/members");
		await dashboard.reload();
		await expect(
			dashboard
				.getByRole("region", { name: "People" })
				.getByRole("listitem")
				.filter({ hasText: bruno.email }),
		).toContainText("Member");
	});
});

test("a link opened while signed in with another account says so", async ({
	dashboard,
	signedInPage,
}) => {
	const email = `${unique("camille")}@example.test`;
	const link = await invite(dashboard, email, "Member");
	const other = await seedUser("Olga");
	const page = await signedInPage(other);

	await page.goto(link);
	await expect(
		page.getByRole("heading", {
			name: "This invitation is not for this account",
		}),
	).toBeVisible();
	await expect(
		page.getByText(`You are signed in as ${other.email}`),
	).toBeVisible();
	await expect(page.getByText(`sent to ${email}`)).toBeVisible();

	await page.getByRole("button", { name: "Sign out" }).click();
	// Signed out, on the same link: the invited person can create the account.
	await expect(
		page.getByRole("heading", { name: "Create your account" }),
	).toBeVisible();
	await expect(page.getByLabel("Email")).toHaveValue(email);
});

test("an admin finds a waiting invitation's link again", async ({
	dashboard,
}) => {
	const email = `${unique("lost")}@example.test`;
	const link = await invite(dashboard, email, "Member");
	await dashboard.reload();
	const form = dashboard.getByRole("region", { name: "Invite someone" });
	await form
		.getByRole("listitem")
		.filter({ hasText: email })
		.getByRole("button", { name: "Show link" })
		.click();
	await expect(form.getByText(`Invitation link for ${email}`)).toBeVisible();
	await expect(form.locator("pre")).toHaveText(link);
});

test("a canceled invitation's link no longer lets anyone in", async ({
	dashboard,
	freshPage,
}) => {
	const email = `${unique("late")}@example.test`;
	const link = await invite(dashboard, email, "Member");
	const waiting = dashboard
		.getByRole("region", { name: "Invite someone" })
		.getByRole("listitem")
		.filter({ hasText: email });
	await waiting.getByRole("button", { name: "Cancel" }).click();
	await expect(dashboard.getByText("Invitation canceled")).toBeVisible();
	await expect(waiting).toHaveCount(0);

	const page = await freshPage();
	await page.goto(link);
	await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a member sees the team but cannot invite", async ({
	workspace,
	signedInPage,
}) => {
	const member = await seedUser("Mia");
	await addMember(workspace.organization.id, member.id, "member");
	const page = await signedInPage(member);
	await page.goto("/members");
	await expect(
		page.getByRole("region", { name: "People" }).getByRole("listitem"),
	).toHaveCount(2);
	await expect(
		page.getByText("Only owners and admins can invite people."),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Create invitation" }),
	).toHaveCount(0);
});
