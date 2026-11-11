import { createHmac, timingSafeEqual } from "node:crypto";

// No vowels (no accidental words) and no 0/O or 1/I to mix up.
const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789";

/**
 * The code needed to create the first (admin) account. Without it, whoever
 * opens a fresh server first would own it. It is printed in the server logs,
 * which only the person running the server can read, and is derived from
 * BETTER_AUTH_SECRET so it stays the same across restarts. SETUP_CODE sets
 * your own instead.
 */
export function setupCode(): string {
	const fixed = process.env.SETUP_CODE?.trim();
	if (fixed) return fixed;
	const bytes = createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "")
		.update("tattle-setup-code")
		.digest();
	let code = "";
	for (let i = 0; i < 12; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
	return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}

// Typed by hand: case, dashes and spaces don't matter.
const normalize = (value: string) =>
	value.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function checkSetupCode(given: unknown): boolean {
	if (typeof given !== "string") return false;
	const a = Buffer.from(normalize(given));
	const b = Buffer.from(normalize(setupCode()));
	return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export const setupCodeLogLine = (baseUrl: string) =>
	`[setup] No account yet. Open ${baseUrl}/login and create the admin account with this setup code: ${setupCode()}`;
