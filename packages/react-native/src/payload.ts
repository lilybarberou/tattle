import { getBreadcrumbs } from "./collectors/breadcrumbs";
import { getConsoleEntries } from "./collectors/console";
import { getDeviceInfo } from "./collectors/device";
import { getNetworkEntries, getOriginalFetch } from "./collectors/network";
import type {
	AppInfo,
	IngestPayload,
	IngestSuccess,
	Reporter,
	TattleType,
	TattleUser,
} from "./types";

export const SDK_NAME = "@tattle/react-native";
export const SDK_VERSION = "0.2.0";
export const MAX_MESSAGE_LENGTH = 5000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface PayloadInput {
	projectKey: string;
	type: TattleType;
	message: string;
	screenshot?: string | undefined;
	email?: string | undefined;
	user: TattleUser | null;
	context: Record<string, unknown> | null;
	screen: string;
	app?: AppInfo | undefined;
	release?: string | undefined;
	reporterKey?: string | null | undefined;
}

function asString(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim()) return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return undefined;
}

/** JSON round-trip that tolerates circular references and functions. */
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

/**
 * The release a report is filed under: the one given to the provider, or the
 * app's version with its build number, as the dashboard shows it.
 */
export function releaseOf(
	release: unknown,
	app: AppInfo | undefined,
): string | undefined {
	const value =
		asString(release) ??
		(app?.version
			? app.build
				? `${app.version} (${app.build})`
				: app.version
			: undefined);
	return value ? value.slice(0, MAX_RELEASE_LENGTH) : undefined;
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
		pageUrl: input.screen.slice(0, 4000),
		device: getDeviceInfo(input.app),
		console: getConsoleEntries(),
		network: getNetworkEntries(),
		breadcrumbs: getBreadcrumbs(),
		sdk: { name: SDK_NAME, version: SDK_VERSION },
	};
	if (input.screenshot && input.type === "bug")
		payload.screenshot = input.screenshot;
	const reporter = buildReporter(input.user, input.email);
	if (reporter) payload.reporter = reporter;
	if (input.context && Object.keys(input.context).length)
		payload.context = toPlainObject(input.context);
	const release = releaseOf(input.release, payload.device.app);
	if (release) payload.release = release;
	if (input.reporterKey) payload.reporterKey = input.reporterKey;
	const hash = asString(input.user?.hash);
	if (hash && reporter?.id) payload.userHash = hash.slice(0, 128);
	return payload;
}

/**
 * What `POST /api/v1/ingest` accepts: a PNG, JPEG or WebP data URL of at most
 * 8 MB as the screenshot, in a JSON body of at most 12 MB.
 */
export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
export const MAX_BODY_BYTES = 12 * 1024 * 1024;
const SCREENSHOT_DATA_URL =
	/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Bytes a base64 data URL decodes to. */
export function dataUrlBytes(dataUrl: string): number {
	const comma = dataUrl.indexOf(",");
	const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
	const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
	return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Bytes of `text` in UTF-8, counted only as far as `limit` + 1. */
function utf8Length(text: string, limit: number): number {
	// Every character takes one to three bytes (a surrogate pair, four for two).
	if (text.length > limit || text.length * 3 <= limit) return text.length;
	let bytes = 0;
	for (let i = 0; i < text.length && bytes <= limit; i++) {
		const code = text.charCodeAt(i);
		bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
		// A surrogate pair is 4 bytes: 3 for the high half, 1 for the low one.
		if (code >= 0xdc00 && code <= 0xdfff) bytes -= 2;
	}
	return bytes;
}

/**
 * Why the server would refuse this report, or null when it fits:
 * "screenshot" when the screenshot is not an image it takes or is over 8 MB,
 * "too_large" when the whole report is over 12 MB.
 */
export function payloadProblem(
	payload: IngestPayload,
): "screenshot" | "too_large" | null {
	const { screenshot } = payload;
	if (
		screenshot !== undefined &&
		(dataUrlBytes(screenshot) > MAX_SCREENSHOT_BYTES ||
			!SCREENSHOT_DATA_URL.test(screenshot))
	)
		return "screenshot";
	const body = JSON.stringify(payload);
	return utf8Length(body, MAX_BODY_BYTES) > MAX_BODY_BYTES ? "too_large" : null;
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
	const controller =
		typeof AbortController !== "undefined" ? new AbortController() : null;
	const timer = controller
		? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
		: undefined;
	let response: Response;
	try {
		response = await getOriginalFetch()(ingestUrl(apiUrl), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			...(controller ? { signal: controller.signal } : {}),
		});
	} catch (error) {
		throw new IngestError(
			error instanceof Error ? error.message : String(error),
			0,
		);
	} finally {
		if (timer) clearTimeout(timer);
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
