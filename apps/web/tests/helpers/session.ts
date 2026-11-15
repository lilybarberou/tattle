import { randomUUID } from "node:crypto";
import { auth } from "#/lib/auth";
import { setupCode } from "#/lib/setup-code";
import { addMember } from "./factories";

const ORIGIN = "http://localhost:3000";

/** Sends a request to Better Auth's handler, as the browser would. */
export const authRequest = (
	path: string,
	body: unknown,
	cookie?: string,
	method = "POST",
) =>
	auth.handler(
		new Request(`${ORIGIN}/api/auth${path}`, {
			method,
			headers: {
				"content-type": "application/json",
				origin: ORIGIN,
				...(cookie ? { cookie } : {}),
			},
			body: method === "GET" ? undefined : JSON.stringify(body),
		}),
	);

export const cookieOf = (response: Response) =>
	(response.headers.getSetCookie?.() ?? [])
		.map((c) => c.split(";")[0])
		.join("; ");

export type SignedIn = {
	userId: string;
	email: string;
	name: string;
	cookie: string;
};

/**
 * Creates an account through Better Auth (sign-up opened for the call) and
 * returns its session cookie.
 */
export const signUp = async (
	input: { email?: string; name?: string } = {},
): Promise<SignedIn> => {
	const email = input.email ?? `person-${randomUUID().slice(0, 8)}@example.com`;
	const name = input.name ?? "Grace Hopper";
	const previous = process.env.ALLOW_SIGNUP;
	process.env.ALLOW_SIGNUP = "true";
	try {
		const response = await authRequest("/sign-up/email", {
			name,
			email,
			password: "a-long-enough-password",
			setupCode: setupCode(),
		});
		if (!response.ok)
			throw new Error(
				`Sign-up failed: ${response.status} ${await response.text()}`,
			);
		const body = (await response.json()) as { user: { id: string } };
		return { userId: body.user.id, email, name, cookie: cookieOf(response) };
	} finally {
		if (previous === undefined) delete process.env.ALLOW_SIGNUP;
		else process.env.ALLOW_SIGNUP = previous;
	}
};

/** A signed-in person with this role in the organization. */
export const signedInMember = async (
	organizationId: string,
	role: "owner" | "admin" | "member" = "member",
	input: { email?: string; name?: string } = {},
) => {
	const person = await signUp(input);
	await addMember(organizationId, person.userId, role);
	return person;
};
