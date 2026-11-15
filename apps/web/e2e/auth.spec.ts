/**
 * Signing in when the password is forgotten: the reset link arrives by
 * email (Mailpit), sets a new password, and signs out every other session.
 */
import { APP_URL, PASSWORD } from "./config.ts";
import { expect, signIn, test } from "./support/fixtures.ts";
import { linkIn, waitForEmail } from "./support/mailpit.ts";

test("a forgotten password is reset from the emailed link, and old sessions end", async ({
	workspace,
	freshPage,
	signedInPage,
	a11y,
}) => {
	const { owner, project } = workspace;
	// Signed in elsewhere before the reset, e.g. on another computer.
	const elsewhere = await signedInPage(owner);
	await elsewhere.goto(`/p/${project.id}/triage`);
	await expect(
		elsewhere.getByRole("heading", { name: /^Triage/ }),
	).toBeVisible();

	const page = await freshPage();
	await page.goto("/login");
	await page.getByRole("link", { name: "Forgot your password?" }).click();
	await expect(
		page.getByRole("heading", { name: "Reset your password" }),
	).toBeVisible();
	await page.getByLabel("Email").fill(owner.email);
	await page.getByRole("button", { name: "Send the link" }).click();
	await expect(
		page.getByText(`If an account uses ${owner.email}, we sent it a link`),
	).toBeVisible();

	const email = await waitForEmail(owner.email, /Reset your Tattle password/);
	await page.goto(linkIn(email, `${APP_URL}/api/auth/reset-password/`));
	await expect(page).toHaveURL(/\/reset-password\?token=/);
	await a11y(page, "reset password");
	const newPassword = `${PASSWORD} again`;
	await page.getByLabel("New password").fill(newPassword);
	await page.getByLabel("Repeat it").fill(newPassword);
	await page.getByRole("button", { name: "Change password" }).click();
	await expect(
		page.getByText("Password changed. Sign in with the new one."),
	).toBeVisible();
	await expect(page).toHaveURL(/\/login/);

	await page.getByLabel("Email").fill(owner.email);
	await page.getByLabel("Password").fill(PASSWORD);
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByText(/invalid email or password/i)).toBeVisible();
	await page.getByLabel("Password").fill(newPassword);
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page).toHaveURL(/\/p\/[\w-]+\/triage/);

	// The session opened before the reset is gone.
	await elsewhere.reload();
	await expect(elsewhere).toHaveURL(/\/login/);
	// The old password no longer signs in through the API either.
	await expect(signIn(elsewhere, owner)).rejects.toThrow();
});
