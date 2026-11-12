import {
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";

/**
 * How the widgets prove who is asking for a report's conversation. Two ways:
 *
 * - The reporter key: a random string the widget generates once per device and
 *   keeps there. Reports carry only its SHA-256 hash; whoever holds the key
 *   follows that device's reports.
 * - Identity verification (opt-in per project): the app's backend signs its
 *   user's id with the project's identity secret, HMAC-SHA256 in hex. A valid
 *   signature lets that user follow their reports from any device. Without
 *   one, a user id the browser sends is never trusted.
 */

export const REPORTER_KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export const hashReporterKey = (key: string) =>
	createHash("sha256").update(key).digest("hex");

/** What the app's backend computes for its signed-in user. */
export const identityHash = (secret: string, userId: string) =>
	createHmac("sha256", secret).update(userId).digest("hex");

/** True when `hash` proves `userId` with the project's identity secret. */
export const identityVerified = (
	secret: string | null,
	userId: string | null | undefined,
	hash: string | null | undefined,
) => {
	if (!secret || !userId || !hash) return false;
	const expected = Buffer.from(identityHash(secret, userId));
	const given = Buffer.from(hash.trim().toLowerCase());
	return expected.length === given.length && timingSafeEqual(expected, given);
};

export const generateIdentitySecret = () =>
	`isk_${randomBytes(24).toString("hex")}`;
