import { getOriginalFetch } from "./collectors/network";
import { internalInit } from "./internal";
import type { TattleUser } from "./types";

/**
 * "My reports": the widget keeps a random key on the device and sends it with
 * each report, so this device can later list its reports and talk with the
 * team. With identity verification, `identify({ id, hash })` opens a user's
 * reports from any device; a user id alone opens nothing.
 */

export type ReporterStatus =
	| "received"
	| "planned"
	| "in_progress"
	| "fixed"
	| "wont_fix";

export interface ReportSummary {
	id: string;
	type: "bug" | "feature";
	title: string;
	status: ReporterStatus;
	unread: number;
	createdAt: string;
	updatedAt: string;
}

export interface ThreadMessage {
	id: string;
	from: "team" | "reporter";
	name: string | null;
	body: string;
	createdAt: string;
}

export interface Thread {
	id: string;
	type: "bug" | "feature";
	title: string;
	message: string;
	status: ReporterStatus;
	createdAt: string;
	messages: ThreadMessage[];
}

/** Minimal Storage, so tests can pass their own. */
export interface KeyStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

const memory = new Map<string, string>();
const memoryStore: KeyStore = {
	getItem: (key) => memory.get(key) ?? null,
	setItem: (key, value) => {
		memory.set(key, value);
	},
};

/** localStorage when the page may use it; memory otherwise (private modes, sandboxed frames). */
export function defaultStore(): KeyStore {
	try {
		const store = globalThis.localStorage;
		const probe = "tattle:probe";
		store.setItem(probe, "1");
		store.removeItem(probe);
		return store;
	} catch {
		return memoryStore;
	}
}

export const storageKey = (projectKey: string) =>
	`tattle:reporter-key:${projectKey}`;

const KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

/** 32 random bytes, base64url: 43 characters. */
export function generateReporterKey(): string {
	const bytes = new Uint8Array(32);
	globalThis.crypto.getRandomValues(bytes);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * This device's key for a project. `create` makes one when there is none:
 * only when a report is sent, so pages never store anything for people who
 * never report.
 */
export function reporterKey(
	projectKey: string,
	create: boolean,
	store: KeyStore = defaultStore(),
): string | null {
	const name = storageKey(projectKey);
	let key: string | null = null;
	try {
		key = store.getItem(name);
	} catch {
		// unreadable storage: treated as empty
	}
	if (key && KEY_PATTERN.test(key)) return key;
	if (!create) return null;
	key = generateReporterKey();
	try {
		store.setItem(name, key);
	} catch {
		memoryStore.setItem(name, key);
	}
	return key;
}

export interface ReporterIdentity {
	projectKey: string;
	reporterKey: string | null;
	user: TattleUser | null;
}

const asText = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim()
		? value.trim()
		: typeof value === "number" && Number.isFinite(value)
			? String(value)
			: undefined;

/**
 * Headers for /api/v1/my-reports, or null when this person cannot have any
 * report to follow (no key on the device, no verified user): no request then.
 */
export function reporterHeaders(
	identity: ReporterIdentity,
): Record<string, string> | null {
	const userId = asText(identity.user?.id);
	const hash = asText(identity.user?.hash);
	if (!identity.reporterKey && !(userId && hash)) return null;
	const headers: Record<string, string> = {
		"x-tattle-project-key": identity.projectKey,
	};
	if (identity.reporterKey)
		headers["x-tattle-reporter-key"] = identity.reporterKey;
	if (userId && hash) {
		headers["x-tattle-user-id"] = userId;
		headers["x-tattle-user-hash"] = hash;
	}
	return headers;
}

export function myReportsUrl(apiUrl: string): string {
	return `${apiUrl.replace(/\/+$/, "")}/api/v1/my-reports`;
}

export class ReporterApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "ReporterApiError";
	}
}

async function call<T>(
	apiUrl: string,
	headers: Record<string, string>,
	path: string,
	body?: unknown,
): Promise<T> {
	let response: Response;
	try {
		response = await getOriginalFetch()(
			`${myReportsUrl(apiUrl)}${path}`,
			internalInit({
				method: body === undefined ? "GET" : "POST",
				headers:
					body === undefined
						? headers
						: { ...headers, "Content-Type": "application/json" },
				body: body === undefined ? undefined : JSON.stringify(body),
				credentials: "omit",
				mode: "cors",
			}),
		);
	} catch (error) {
		throw new ReporterApiError(
			error instanceof Error ? error.message : String(error),
			0,
		);
	}
	let json: unknown = null;
	try {
		json = await response.json();
	} catch {
		// non-JSON body
	}
	if (!response.ok) {
		const message =
			json && typeof json === "object" && "error" in json
				? String((json as { error: unknown }).error)
				: "";
		throw new ReporterApiError(message, response.status);
	}
	return json as T;
}

export const fetchReports = (apiUrl: string, headers: Record<string, string>) =>
	call<{ reports: ReportSummary[]; unread: number }>(apiUrl, headers, "");

export const fetchThread = (
	apiUrl: string,
	headers: Record<string, string>,
	id: string,
) => call<Thread>(apiUrl, headers, `/${encodeURIComponent(id)}`);

export const sendMessage = (
	apiUrl: string,
	headers: Record<string, string>,
	id: string,
	body: string,
) =>
	call<ThreadMessage>(apiUrl, headers, `/${encodeURIComponent(id)}/messages`, {
		body,
	});

export const markRead = (
	apiUrl: string,
	headers: Record<string, string>,
	id: string,
) => call<{ ok: true }>(apiUrl, headers, `/${encodeURIComponent(id)}/read`, {});
