// Script-tag entry: exposes `window.Tattle` and auto-initializes from the
// <script data-project-key="pk_..." data-api-url="https://host"> attributes.
import {
	addBreadcrumb,
	close,
	destroy,
	identify,
	init,
	open,
	setColorScheme,
	setContext,
	setTheme,
} from "./index";
import { isColorScheme } from "./theme";
import type { InitOptions } from "./types";

export {
	addBreadcrumb,
	close,
	destroy,
	identify,
	init,
	open,
	setColorScheme,
	setContext,
	setTheme,
};

/** A queued call: `[method, ...args]` or the `arguments` object of a stub function. */
type QueuedCall = ArrayLike<unknown>;

const api: Record<string, (...args: never[]) => void> = {
	init,
	identify,
	setContext,
	addBreadcrumb,
	setTheme,
	setColorScheme,
	open,
	close,
	destroy,
};

function readScriptOptions(script: HTMLScriptElement): InitOptions | null {
	const projectKey = script.getAttribute("data-project-key");
	if (!projectKey) return null;
	const options: InitOptions = { projectKey };
	let apiUrl = script.getAttribute("data-api-url");
	if (!apiUrl && script.src) {
		try {
			apiUrl = new URL(script.src, location.href).origin;
		} catch {
			// ignore
		}
	}
	if (apiUrl) options.apiUrl = apiUrl;
	const position = script.getAttribute("data-position");
	if (position === "bottom-left" || position === "bottom-right")
		options.position = position;
	const locale = script.getAttribute("data-locale");
	if (locale === "fr" || locale === "en") options.locale = locale;
	const accent = script.getAttribute("data-accent-color");
	if (accent) options.accentColor = accent;
	const scheme = script.getAttribute("data-color-scheme");
	if (isColorScheme(scheme)) options.colorScheme = scheme;
	if (script.getAttribute("data-show-button") === "false")
		options.showButton = false;
	const release = script.getAttribute("data-release");
	if (release) options.release = release;
	return options;
}

/**
 * Replays calls recorded by the optional loader stub:
 *   window.Tattle = window.Tattle || { q: [] };
 *   ["init","identify","setContext","addBreadcrumb","setTheme","setColorScheme","open","close","destroy"].forEach(m =>
 *     Tattle[m] = (...a) => Tattle.q.push([m, ...a]));
 */
function replayQueue(stub: unknown): void {
	const queue =
		stub && typeof stub === "object" ? (stub as { q?: unknown }).q : undefined;
	if (!Array.isArray(queue)) return;
	for (const raw of queue as QueuedCall[]) {
		const [method, ...args] = Array.from(raw ?? []);
		const fn = typeof method === "string" ? api[method] : undefined;
		if (!fn) continue;
		try {
			(fn as (...a: unknown[]) => void)(...args);
		} catch (error) {
			console.error("[tattle] queued call failed:", method, error);
		}
	}
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
	// Read synchronously: currentScript is only set during initial evaluation,
	// and `window.Tattle` still holds the stub until this IIFE returns.
	const script = document.currentScript as HTMLScriptElement | null;
	const stub: unknown = (window as unknown as { Tattle?: unknown }).Tattle;
	const scriptOptions = script ? readScriptOptions(script) : null;
	const queued =
		stub &&
		typeof stub === "object" &&
		Array.isArray((stub as { q?: unknown }).q);
	const queueHasInit =
		queued &&
		(stub as { q: QueuedCall[] }).q.some((call) => call?.[0] === "init");
	// identify/setContext from the queue must be applied before the widget renders,
	// so replay first, then auto-init from attributes (unless the queue already did).
	replayQueue(stub);
	if (scriptOptions && !queueHasInit) init(scriptOptions);
}
