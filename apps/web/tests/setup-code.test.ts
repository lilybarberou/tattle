import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "#/lib/auth";
import { checkSetupCode, setupCode } from "#/lib/setup-code";
import { createUser } from "./helpers/factories";
import { setupTestDatabase } from "./helpers/runtime";

setupTestDatabase();

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("setupCode", () => {
	it("is three groups of four, stable for one secret, different for another", () => {
		const code = setupCode();
		expect(code).toMatch(/^[B-Z2-9]{4}-[B-Z2-9]{4}-[B-Z2-9]{4}$/);
		expect(setupCode()).toBe(code);
		vi.stubEnv(
			"BETTER_AUTH_SECRET",
			"another-secret-that-is-32-characters-long",
		);
		expect(setupCode()).not.toBe(code);
	});

	it("takes SETUP_CODE when it is set", () => {
		vi.stubEnv("SETUP_CODE", "my-own-code");
		expect(setupCode()).toBe("my-own-code");
		expect(checkSetupCode("MY OWN CODE")).toBe(true);
	});

	it("ignores case, dashes and spaces, and refuses anything else", () => {
		const code = setupCode();
		expect(checkSetupCode(code.toLowerCase().replaceAll("-", " "))).toBe(true);
		expect(checkSetupCode(`${code}X`)).toBe(false);
		expect(checkSetupCode("")).toBe(false);
		expect(checkSetupCode(undefined)).toBe(false);
		expect(checkSetupCode(42)).toBe(false);
	});
});

describe("creating the first account", () => {
	const signUp = (body: Record<string, unknown>) =>
		auth.api.signUpEmail({
			body: {
				name: "Admin",
				email: "admin@example.com",
				password: "a-long-enough-password",
				...body,
			} as {
				name: string;
				email: string;
				password: string;
			},
		});

	it("is refused without the setup code, or with a wrong one", async () => {
		await expect(signUp({})).rejects.toThrow(/setup code/);
		await expect(signUp({ setupCode: "BBBB-BBBB-BBBB" })).rejects.toThrow(
			/setup code/,
		);
	});

	it("works with the setup code", async () => {
		const result = await signUp({ setupCode: setupCode() });
		expect(result.user.email).toBe("admin@example.com");
	});

	it("no longer asks for it once an account exists", async () => {
		await createUser();
		vi.stubEnv("ALLOW_SIGNUP", "true");
		const result = await signUp({ email: "second@example.com" });
		expect(result.user.email).toBe("second@example.com");
	});
});
