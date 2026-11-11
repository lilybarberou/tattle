import { getRequestIP } from "@tanstack/react-start/server";

/**
 * Fixed-window counters kept in memory. Enough for one server process; the
 * public project key is visible in every app that embeds the widget, so this
 * is what stops a script from flooding Triage.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

const hit = (key: string, limit: number, windowMs: number) => {
	const now = Date.now();
	const current = windows.get(key);
	if (!current || current.resetAt <= now) {
		windows.set(key, { count: 1, resetAt: now + windowMs });
		return { ok: true, retryAfter: 0 };
	}
	current.count += 1;
	return {
		ok: current.count <= limit,
		retryAfter: Math.ceil((current.resetAt - now) / 1000),
	};
};

// Drop expired windows now and then so the map does not grow forever.
let lastSweep = 0;
const sweep = () => {
	const now = Date.now();
	if (now - lastSweep < 60_000) return;
	lastSweep = now;
	for (const [key, value] of windows)
		if (value.resetAt <= now) windows.delete(key);
};

const numberFromEnv = (name: string, fallback: number) => {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** The caller's IP; X-Forwarded-For is trusted only when TRUST_PROXY=true. */
export const clientIp = () =>
	getRequestIP({ xForwardedFor: process.env.TRUST_PROXY === "true" }) ??
	"unknown";

/** The header Better Auth reads the client IP from. Only this server sets it. */
export const CLIENT_IP_HEADER = "x-tattle-client-ip";

/**
 * Better Auth limits sign-in attempts per IP but would trust X-Forwarded-For
 * from anyone, so a script could change it on every try. The request it gets
 * carries the IP worked out by clientIp() instead, under the TRUST_PROXY rule.
 */
export const withClientIp = (request: Request) => {
	const headers = new Headers(request.headers);
	headers.set(CLIENT_IP_HEADER, clientIp());
	// Nitro's request is not a native Request, so it is rebuilt field by field.
	const hasBody = request.method !== "GET" && request.method !== "HEAD";
	return new Request(request.url, {
		method: request.method,
		headers,
		body: hasBody ? request.body : undefined,
		signal: request.signal,
		...(hasBody ? { duplex: "half" } : {}),
	} as RequestInit);
};

/**
 * Reports per IP (default 20 per 10 minutes) and per project key (default
 * 300 per hour). Returns the seconds to wait when a limit is reached.
 */
export const limitIngest = (ip: string, projectKey: string) => {
	sweep();
	const perIp = hit(
		`ip:${ip}`,
		numberFromEnv("INGEST_LIMIT_PER_IP", 20),
		10 * 60_000,
	);
	if (!perIp.ok) return perIp;
	return hit(
		`project:${projectKey}`,
		numberFromEnv("INGEST_LIMIT_PER_PROJECT", 300),
		60 * 60_000,
	);
};

/** Votes, emails and suggestions on the public portal: 30 per IP per 10 minutes. */
export const limitPortal = (ip: string) => {
	sweep();
	return hit(
		`portal:${ip}`,
		numberFromEnv("PORTAL_LIMIT_PER_IP", 30),
		10 * 60_000,
	);
};
