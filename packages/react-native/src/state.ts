import type { OpenOptions, TattleType, TattleUser } from "./types";

/**
 * Module-level state shared by the imperative `Tattle` API and the provider,
 * so `identify`, `setContext` and `open` work from anywhere, even before the
 * provider mounts.
 */
type Listener = () => void;

export const state = {
	user: null as TattleUser | null,
	context: null as Record<string, unknown> | null,
	screen: "",
	/** A panel request waiting for the provider (or for it to mount). */
	openRequest: null as { type: TattleType | undefined } | null,
	closeRequested: false,
	/** True while the screen is captured: `<TattleMask>` covers its content. */
	masking: false,
	/** Number of mounted `<TattleMask>`, so capture skips the wait when none. */
	masks: 0,
	/** URL prefixes never recorded: the SDK's own endpoints. */
	ignoredUrls: [] as string[],
	/** Bumped by `identify`, so the provider fetches "My reports" again. */
	identityVersion: 0,
};

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function notify(): void {
	for (const listener of listeners) listener();
}

export function requestOpen(options?: OpenOptions): void {
	const type =
		options?.type === "bug" || options?.type === "feature"
			? options.type
			: undefined;
	state.openRequest = { type };
	state.closeRequested = false;
	notify();
}

export function requestClose(): void {
	state.openRequest = null;
	state.closeRequested = true;
	notify();
}
