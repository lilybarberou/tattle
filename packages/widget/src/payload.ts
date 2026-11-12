import { getBreadcrumbs } from "./collectors/breadcrumbs";
import { getConsoleEntries } from "./collectors/console";
import { getDeviceInfo } from "./collectors/device";
import { getNetworkEntries, getOriginalFetch } from "./collectors/network";
import { internalInit } from "./internal";
import { redactUrl } from "./redact";
import type {
	IngestPayload,
	IngestSuccess,
	Reporter,
	TattleType,
	TattleUser,
} from "./types";

export const SDK_NAME = "@tattle/widget";
export const SDK_VERSION = "0.1.0";
export const MAX_MESSAGE_LENGTH = 5000;

export interface PayloadInput {
	projectKey: string;
	type: TattleType;
	message: string;
	screenshot?: string | undefined;
	email?: string | undefined;
	user: TattleUser | null;
	context: Record<string, unknown> | null;
	release?: string | undefined;
	reporterKey?: string | null | undefined;
}

function asString(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim()) return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return undefined;
}

/** JSON round-trip that tolerates circular references / functions. */
function toPlainObject(
	value: Record<string, unknown>,
): Record<string, unknown> {
	const seen = new WeakSet<object>();
	return JSON.parse(
		JSON.stringify(value, (_key, val: unknown) => {
			if (typeof val === "bigint") return val.toString();
			if (val && typeof val === "object") {
				if (seen.has(val)) return "[Circular]";
				seen.add(val);
			}
			return val;
		}),
	) as Record<string, unknown>;
}

export const MAX_RELEASE_LENGTH = 100;

/** A release the server accepts: trimmed, at most 100 characters. */
export function cleanRelease(value: unknown): string | undefined {
	const release = asString(value);
	return release ? release.slice(0, MAX_RELEASE_LENGTH) : undefined;
}

export function buildReporter(
	user: TattleUser | null,
	typedEmail?: string,
): Reporter | undefined {
	const reporter: Reporter = {};
	if (user) {
		const { id, email, name, hash: _hash, ...traits } = user;
		const sId = asString(id);
		const sEmail = asString(email);
		const sName = asString(name);
		if (sId) reporter.id = sId;
		if (sEmail) reporter.email = sEmail;
		if (sName) reporter.name = sName;
		const clean = toPlainObject(traits);
		if (Object.keys(clean).length) reporter.traits = clean;
	}
	const typed = typedEmail?.trim();
	if (typed && !reporter.email) reporter.email = typed;
	return Object.keys(reporter).length ? reporter : undefined;
}

export function buildPayload(input: PayloadInput): IngestPayload {
	const payload: IngestPayload = {
		projectKey: input.projectKey,
		type: input.type,
		message: input.message.trim().slice(0, MAX_MESSAGE_LENGTH),
		pageUrl: redactUrl(location.href),
		device: getDeviceInfo(),
		console: getConsoleEntries(),
		network: getNetworkEntries(),
		breadcrumbs: getBreadcrumbs(),
		sdk: { name: SDK_NAME, version: SDK_VERSION },
	};
	if (input.screenshot && input.type === "bug")
		payload.screenshot = input.screenshot;
	if (document.title) payload.pageTitle = document.title.slice(0, 500);
	const reporter = buildReporter(input.user, input.email);
	if (reporter) payload.reporter = reporter;
	if (input.context && Object.keys(input.context).length)
		payload.context = toPlainObject(input.context);
	const release = cleanRelease(input.release);
	if (release) payload.release = release;
	if (input.reporterKey) payload.reporterKey = input.reporterKey;
	const hash = asString(input.user?.hash);
	if (hash && reporter?.id) payload.userHash = hash.slice(0, 128);
	return payload;
}

export function ingestUrl(apiUrl: string): string {
	return `${apiUrl.replace(/\/+$/, "")}/api/v1/ingest`;
}

export class IngestError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "IngestError";
	}
}

/** POSTs the report. Throws IngestError (status 0 = network failure). */
export async function sendPayload(
	apiUrl: string,
	payload: IngestPayload,
): Promise<IngestSuccess> {
	let response: Response;
	try {
		response = await getOriginalFetch()(
			ingestUrl(apiUrl),
			internalInit({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				credentials: "omit",
				mode: "cors",
			}),
		);
	} catch (error) {
		throw new IngestError(
			error instanceof Error ? error.message : String(error),
			0,
		);
	}
	let body: unknown = null;
	try {
		body = await response.json();
	} catch {
		// non-JSON body
	}
	if (!response.ok) {
		const message =
			body &&
			typeof body === "object" &&
			typeof (body as { error?: unknown }).error === "string"
				? (body as { error: string }).error
				: "";
		throw new IngestError(message, response.status);
	}
	return (
		body && typeof body === "object" ? body : { id: "" }
	) as IngestSuccess;
}
