import {
	installBreadcrumbCollector,
	uninstallBreadcrumbCollector,
} from "./collectors/breadcrumbs";
import {
	installConsoleCollector,
	uninstallConsoleCollector,
} from "./collectors/console";
import {
	installNetworkCollector,
	uninstallNetworkCollector,
} from "./collectors/network";
import type { BeforeSend, CollectOptions, IngestPayload } from "./types";

export const COLLECTORS = ["console", "network", "steps"] as const;

/**
 * Starts the collectors that are on and stops the others. A stopped
 * collector restores what it patched (console, fetch, XMLHttpRequest,
 * history) and forgets what it had kept, so nothing gathered before `init`
 * is ever sent. Steps added with `addBreadcrumb` afterwards are still recorded.
 */
export function applyCollection(collect: CollectOptions | undefined): void {
	if (collect?.console === false) uninstallConsoleCollector();
	else installConsoleCollector();
	if (collect?.network === false) uninstallNetworkCollector();
	else installNetworkCollector();
	if (collect?.steps === false) uninstallBreadcrumbCollector();
	else installBreadcrumbCollector();
}

/**
 * `data-collect` on the script tag: the collectors to keep, separated by
 * commas or spaces ("console, network"), or "none". Unknown names are
 * ignored; no attribute keeps them all.
 */
export function parseCollect(value: string | null): CollectOptions | undefined {
	if (value === null) return undefined;
	const names = new Set(
		value
			.toLowerCase()
			.split(/[\s,]+/)
			.filter(Boolean),
	);
	return {
		console: names.has("console"),
		network: names.has("network"),
		steps: names.has("steps"),
	};
}

/** Thrown when `beforeSend` drops a report (or fails): nothing is sent. */
export class ReportDropped extends Error {
	constructor() {
		super("The report was dropped by beforeSend");
		this.name = "ReportDropped";
	}
}

/**
 * Runs the app's `beforeSend` on a copy of the report: it may change it
 * (remove the screenshot, rewrite a log line…) or return null to drop it.
 * If it throws, the report is dropped too: when in doubt, nothing leaves.
 */
export async function applyBeforeSend(
	payload: IngestPayload,
	beforeSend: BeforeSend | undefined,
): Promise<IngestPayload> {
	if (typeof beforeSend !== "function") return payload;
	let result: IngestPayload | null | undefined | false;
	try {
		result = await beforeSend(JSON.parse(JSON.stringify(payload)));
	} catch {
		throw new ReportDropped();
	}
	if (!result || typeof result !== "object") throw new ReportDropped();
	// The project is not the app's to change.
	return { ...result, projectKey: payload.projectKey };
}
