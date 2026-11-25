import { type ImagePicker, imagePicker } from "./optional";
import { dataUrlBytes } from "./payload";

export interface Size {
	width: number;
	height: number;
}

/** An image chosen in the photo library, before it is annotated. */
export interface PickedImage {
	uri: string;
	width: number;
	height: number;
}

/**
 * Longest edge of a chosen image once flattened, in pixels: a phone's own
 * screenshot keeps its size (2556 on recent iPhones), larger photos shrink.
 */
export const MAX_IMAGE_EDGE = 2560;

/**
 * Most a chosen image may weigh once encoded. The server takes up to 8 MB in a
 * 12 MB body; half of that leaves room for the logs and the base64 overhead.
 */
export const IMAGE_BUDGET_BYTES = 4 * 1024 * 1024;

/**
 * Encodings tried in turn until the image fits the budget: today's screenshot
 * quality first, then lower quality, then fewer pixels.
 */
export const ENCODE_STEPS: ReadonlyArray<{ scale: number; quality: number }> = [
	{ scale: 1, quality: 0.85 },
	{ scale: 1, quality: 0.7 },
	{ scale: 0.75, quality: 0.7 },
	{ scale: 0.5, quality: 0.6 },
];

/** The image could not be brought under `IMAGE_BUDGET_BYTES`. */
export class ImageTooLarge extends Error {
	constructor() {
		super("Image is too large");
		this.name = "ImageTooLarge";
	}
}

/** True when the app has `expo-image-picker`: "Choose an image" is offered. */
export function canPickImage(): boolean {
	return imagePicker() !== null;
}

/**
 * Opens the system photo picker, which needs no photo-library permission on
 * recent iOS and Android. Resolves to null when the person cancels or the
 * module is missing; rejects when the picker could not open.
 */
export async function pickImage(
	picker: ImagePicker | null = imagePicker(),
): Promise<PickedImage | null> {
	if (!picker) return null;
	const result = await picker.launchImageLibraryAsync({
		mediaTypes: ["images"],
		allowsEditing: false,
		allowsMultipleSelection: false,
		base64: false,
		exif: false,
		quality: 1,
	});
	if (!result || result.canceled || result.cancelled) return null;
	// expo-image-picker before SDK 48 put the asset at the top level.
	const asset = result.assets?.[0] ?? (result.uri ? result : undefined);
	if (!asset?.uri) return null;
	const width = Number(asset.width);
	const height = Number(asset.height);
	if (!(width > 0 && height > 0)) return null;
	return { uri: asset.uri, width, height };
}

/** `size` shrunk to fit `maxEdge` on its longest side, never enlarged. */
export function fitWithin(size: Size, maxEdge: number): Size {
	const longest = Math.max(size.width, size.height);
	const k = longest > maxEdge ? maxEdge / longest : 1;
	return {
		width: Math.max(1, Math.round(size.width * k)),
		height: Math.max(1, Math.round(size.height * k)),
	};
}

/**
 * Pixel size a chosen image is flattened at: what the editor shows (its
 * canvas, in points, times the pixel ratio), never more than the image's own
 * pixels, nor than `MAX_IMAGE_EDGE`.
 */
export function targetPixels(
	canvas: Size,
	pixelRatio: number,
	natural: Size,
): Size {
	const shown = {
		width: canvas.width * pixelRatio,
		height: canvas.height * pixelRatio,
	};
	const edge = Math.min(
		Math.max(shown.width, shown.height),
		Math.max(natural.width, natural.height),
		MAX_IMAGE_EDGE,
	);
	return fitWithin(shown, edge);
}

/**
 * The `width` and `height` to give react-native-view-shot for an image of
 * `pixels`: Android takes pixels, iOS points (it multiplies by the screen scale).
 */
export function captureDimensions(
	pixels: Size,
	platform: string,
	pixelRatio: number,
): Size {
	if (platform !== "ios" || !(pixelRatio > 0)) return pixels;
	return {
		width: pixels.width / pixelRatio,
		height: pixels.height / pixelRatio,
	};
}

/**
 * Encodes the image with each of `ENCODE_STEPS` until one fits `budget`.
 * `encode` renders it at the given pixel size and JPEG quality.
 */
export async function encodeWithinLimit(
	pixels: Size,
	encode: (options: Size & { quality: number }) => Promise<string>,
	budget: number = IMAGE_BUDGET_BYTES,
): Promise<string> {
	for (const step of ENCODE_STEPS) {
		const size = {
			width: Math.max(1, Math.round(pixels.width * step.scale)),
			height: Math.max(1, Math.round(pixels.height * step.scale)),
		};
		const dataUrl = await encode({ ...size, quality: step.quality });
		if (dataUrlBytes(dataUrl) <= budget) return dataUrl;
	}
	throw new ImageTooLarge();
}
