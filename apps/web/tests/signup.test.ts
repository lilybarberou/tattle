import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { invitation } from "#/db/schema";
import { signupPolicy } from "#/lib/signup";
import { createOrganization, createUser } from "./helpers/factories";
import { setupTestDatabase } from "./helpers/runtime";

setupTestDatabase();

afterEach(() => {
	vi.unstubAllEnvs();
});

const invite = async (
	email: string,
	options: { status?: string; expiresAt?: Date } = {},
) => {
	const org = await createOrganization();
	const inviter = await createUser();
	await db.insert(invitation).values({
		id: randomUUID(),
		organizationId: org.id,
		email,
		status: options.status ?? "pending",
		expiresAt: options.expiresAt ?? new Date(Date.now() + 86_400_000),
		inviterId: inviter.id,
	});
};

describe("signupPolicy", () => {
	it("lets the very first account in", async () => {
		expect(await signupPolicy("admin@example.com")).toEqual({
			firstUser: true,
			open: false,
			allowed: true,
		});
	});

	it("then only lets invited emails in", async () => {
		await createUser();
		await invite("guest@example.com");
		expect((await signupPolicy("stranger@example.com")).allowed).toBe(false);
		expect((await signupPolicy(" Guest@Example.com ")).allowed).toBe(true);
		expect((await signupPolicy()).allowed).toBe(false);
	});

	it("ignores expired or used invitations", async () => {
		await invite("late@example.com", {
			expiresAt: new Date(Date.now() - 1000),
		});
		await invite("done@example.com", { status: "accepted" });
		expect((await signupPolicy("late@example.com")).allowed).toBe(false);
		expect((await signupPolicy("done@example.com")).allowed).toBe(false);
	});

	it("lets anyone in with ALLOW_SIGNUP=true", async () => {
		await createUser();
		vi.stubEnv("ALLOW_SIGNUP", "true");
		expect(await signupPolicy("anyone@example.com")).toEqual({
			firstUser: false,
			open: true,
			allowed: true,
		});
	});
});
