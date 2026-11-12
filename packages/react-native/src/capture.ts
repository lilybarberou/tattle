import type { ComponentRef, RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";

export type ViewRef = RefObject<ComponentRef<typeof View> | null>;

import { notify, state } from "./state";

const JPEG_QUALITY = 0.85;

const nextFrame = () =>
	new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Captures a view as a JPEG data URL. While it runs, every `<TattleMask>`
 * covers its content with a solid block, so masked content never reaches the
 * image.
 */
export async function captureView(
	ref: ViewRef,
	options: { mask?: boolean } = {},
): Promise<string> {
	const mask = options.mask !== false && state.masks > 0;
	if (mask) {
		state.masking = true;
		notify();
		// One frame for React to render the masks, one for the native side to draw them.
		await nextFrame();
		await nextFrame();
	}
	try {
		return await captureRef(ref as Parameters<typeof captureRef>[0], {
			format: "jpg",
			quality: JPEG_QUALITY,
			result: "data-uri",
		});
	} finally {
		if (mask) {
			state.masking = false;
			notify();
		}
	}
}
