import { getOriginalFetch } from "./collectors/network";
import type { Strings } from "./i18n";
import { expoCrypto, type KeyValueStore, persistentStore } from "./optional";
import type { TattleUser } from "./types";

/**
 * "My reports": the SDK keeps a random key on the device and sends it with
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

export const storageKey = (projectKey: string) =>
	`tattle.reporter-key.${projectKey.replace(/[^A-Za-z0-9._-]/g, "_")}`;

const KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

let warnedWeakRandom = false;

/** 32 random bytes, base64url: 43 characters. */
export function generateReporterKey(): string {
	const bytes = new Uint8Array(32);
	const webCrypto = (
		globalThis as {
			crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
		}
	).crypto;
	if (typeof webCrypto?.getRandomValues === "function") {
		webCrypto.getRandomValues(bytes);
	} else {
		const expo = expoCrypto();
		if (expo) bytes.set(expo.getRandomBytes(32));
		else {
			if (!warnedWeakRandom) {
				warnedWeakRandom = true;
				console.warn(
					"[tattle] No secure random source: install expo-crypto or react-native-get-random-values so the key that opens a user's reports cannot be guessed.",
				);
			}
			for (let i = 0; i < bytes.length; i++)
				bytes[i] = Math.floor(Math.random() * 256);
		}
	}
	const alphabet =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	let out = "";
	for (let i = 0; i < bytes.length; i += 3) {
		const n =
			((bytes[i] ?? 0) << 16) |
			((bytes[i + 1] ?? 0) << 8) |
			(bytes[i + 2] ?? 0);
		const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
		for (let j = 0; j < chars; j++) out += alphabet[(n >> (18 - 6 * j)) & 63];
	}
	return out;
}

/** Keys kept for this app session when no storage module is installed. */
const memory = new Map<string, string>();
let warnedMemory = false;

/**
 * This device's key for a project. `create` makes one when there is none:
 * only when a report is sent. Kept in expo-secure-store or AsyncStorage when
 * the app has one of them; otherwise in memory, until the app restarts.
 */
export async function reporterKey(
	projectKey: string,
	create: boolean,
	store: KeyValueStore | null = persistentStore()?.store ?? null,
): Promise<string | null> {
	const name = storageKey(projectKey);
	let key = memory.get(name) ?? null;
	if (!key && store) {
		try {
			key = await store.getItem(name);
		} catch {
			key = null;
		}
	}
	if (key && KEY_PATTERN.test(key)) {
		memory.set(name, key);
		return key;
	}
	if (!create) return null;
	key = generateReporterKey();
	memory.set(name, key);
	if (store) {
		try {
			await store.setItem(name, key);
		} catch {
			// kept in memory for this session
		}
	} else if (!warnedMemory) {
		warnedMemory = true;
		console.warn(
			'[tattle] Install expo-secure-store or @react-native-async-storage/async-storage so people can follow their reports after the app restarts. Until then, "My reports" only lasts for this session.',
		);
	}
	return key;
}

/** Forgets the keys kept in memory (tests). */
export function clearReporterKeys(): void {
	memory.clear();
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
 * report to follow (no key on the device, no verified user).
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

/** The status in the reporter's words; a done idea is "available", a done bug "fixed". */
export function statusLabel(
	t: Strings,
	status: ReporterStatus,
	type: "bug" | "feature",
): string {
	switch (status) {
		case "planned":
			return t.statusPlanned;
		case "in_progress":
			return t.statusInProgress;
		case "fixed":
			return type === "feature" ? t.statusShipped : t.statusFixed;
		case "wont_fix":
			return t.statusWontFix;
		default:
			return t.statusReceived;
	}
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

const REQUEST_TIMEOUT_MS = 20_000;

async function call<T>(
	apiUrl: string,
	headers: Record<string, string>,
	path: string,
	body?: unknown,
): Promise<T> {
	const controller =
		typeof AbortController !== "undefined" ? new AbortController() : null;
	const timer = controller
		? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
		: undefined;
	let response: Response;
	try {
		response = await getOriginalFetch()(`${myReportsUrl(apiUrl)}${path}`, {
			method: body === undefined ? "GET" : "POST",
			headers:
				body === undefined
					? headers
					: { ...headers, "Content-Type": "application/json" },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			...(controller ? { signal: controller.signal } : {}),
		});
	} catch (error) {
		throw new ReporterApiError(
			error instanceof Error ? error.message : String(error),
			0,
		);
	} finally {
		if (timer) clearTimeout(timer);
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
