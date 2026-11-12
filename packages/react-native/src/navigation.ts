import {
	pushBreadcrumb,
	addBreadcrumb as pushCustomBreadcrumb,
} from "./collectors/breadcrumbs";
import { state } from "./state";
import type { BreadcrumbInput } from "./types";

/**
 * Names the screen the user is on: reports show it, and each new screen is a
 * step of the trail sent with the next report.
 */
export function setScreen(name: string | null | undefined): void {
	const next = typeof name === "string" ? name : "";
	if (next && next !== state.screen) pushBreadcrumb("navigation", next);
	state.screen = next;
}

/**
 * Adds a step to the trail sent with the next report, next to the screens and
 * foreground/background changes the SDK records.
 */
export function addBreadcrumb(breadcrumb: BreadcrumbInput): void {
	pushCustomBreadcrumb(breadcrumb);
}

/** The parts of a React Navigation container ref the SDK uses. */
export interface NavigationRefLike {
	getCurrentRoute(): { name: string } | undefined | null;
	addListener(event: "state", callback: () => void): () => void;
}

/**
 * Follows React Navigation (or Expo Router's `useNavigationContainerRef()`):
 * calls `setScreen` with the current route's name on every navigation. Call
 * it once the container is ready; it returns a function that stops it.
 */
export function trackNavigation(
	navigation: NavigationRefLike | { current: NavigationRefLike | null },
): () => void {
	// Container refs from `useNavigationContainerRef()` have the methods
	// themselves (and also `current`); a plain `useRef` only has `current`.
	const ref =
		"addListener" in navigation
			? navigation
			: (navigation as { current: NavigationRefLike | null }).current;
	if (!ref || typeof ref.addListener !== "function") return () => {};
	const update = () => {
		try {
			setScreen(ref.getCurrentRoute()?.name);
		} catch {
			// not ready yet
		}
	};
	update();
	return ref.addListener("state", update);
}
