/**
 * Shared flags between the collectors and the widget so the SDK does not
 * record its own activity (ingest request, screenshot resource fetches,
 * html-to-image warnings).
 */

/** Property set on RequestInit objects created by the SDK. */
export const INTERNAL_MARK = "__tattleInternal";

export const internalState = {
	/** > 0 while a screenshot is being captured. */
	capturing: 0,
	/** URL prefixes that must never be recorded (ingest endpoint). */
	ignoredUrls: [] as string[],
};

export function internalInit(init: RequestInit = {}): RequestInit {
	return Object.assign(init, { [INTERNAL_MARK]: true });
}

export function isInternalInit(init: unknown): boolean {
	return (
		!!init &&
		typeof init === "object" &&
		(init as Record<string, unknown>)[INTERNAL_MARK] === true
	);
}
