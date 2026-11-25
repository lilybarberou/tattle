import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImagePicker } from "../src/optional";

// expo-image-picker is optional: the test decides whether the app has it.
const optional = vi.hoisted(() => ({
	picker: null as ImagePicker | null,
}));
vi.mock("../src/optional", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/optional")>()),
	imagePicker: () => optional.picker,
}));

import {
	canPickImage,
	captureDimensions,
	ENCODE_STEPS,
	encodeWithinLimit,
	fitWithin,
	IMAGE_BUDGET_BYTES,
	ImageTooLarge,
	MAX_IMAGE_EDGE,
	pickImage,
	targetPixels,
} from "../src/image";
import { buildPayload, dataUrlBytes, payloadProblem } from "../src/payload";

/** A picker that answers `result`, recording the options it was opened with. */
function fakePicker(result: unknown) {
	const launch = vi.fn(async (_options: Record<string, unknown>) => result);
	return {
		picker: { launchImageLibraryAsync: launch } as unknown as ImagePicker,
		launch,
	};
}

/** A JPEG data URL that decodes to `bytes` bytes. */
const jpeg = (bytes: number) =>
	`data:image/jpeg;base64,${"A".repeat(Math.ceil(bytes / 3) * 4)}`;

beforeEach(() => {
	optional.picker = null;
});

describe("choosing an image", () => {
	it("is offered only when the app has expo-image-picker", () => {
		expect(canPickImage()).toBe(false);
		optional.picker = fakePicker(null).picker;
		expect(canPickImage()).toBe(true);
	});

	it("uses expo-image-picker only when the app can load it", async () => {
		const real =
			await vi.importActual<typeof import("../src/optional")>(
				"../src/optional",
			);
		const installed = { launchImageLibraryAsync: async () => null };
		expect(real.asImagePicker(installed)).toBe(installed);
		// An old or stubbed module without the picker is not used.
		expect(real.asImagePicker({})).toBeNull();
		expect(real.asImagePicker(null)).toBeNull();
		// Node cannot load the native module: same as an app without it.
		expect(real.imagePicker()).toBeNull();
	});

	it("does nothing without a picker", async () => {
		await expect(pickImage()).resolves.toBeNull();
	});

	it("opens the system picker for one image, without base64 or EXIF", async () => {
		const { picker, launch } = fakePicker({
			canceled: false,
			assets: [{ uri: "file:///photo.jpg", width: 1179, height: 2556 }],
		});
		optional.picker = picker;
		await expect(pickImage()).resolves.toEqual({
			uri: "file:///photo.jpg",
			width: 1179,
			height: 2556,
		});
		expect(launch).toHaveBeenCalledWith(
			expect.objectContaining({
				mediaTypes: ["images"],
				allowsMultipleSelection: false,
				base64: false,
				exif: false,
			}),
		);
	});

	it("changes nothing when the person cancels", async () => {
		for (const result of [
			{ canceled: true, assets: null },
			{ cancelled: true },
			{ canceled: false, assets: [] },
			null,
		]) {
			await expect(pickImage(fakePicker(result).picker)).resolves.toBeNull();
		}
	});

	it("reads the result of expo-image-picker before SDK 48", async () => {
		const { picker } = fakePicker({
			cancelled: false,
			uri: "file:///old.png",
			width: 800,
			height: 600,
		});
		await expect(pickImage(picker)).resolves.toEqual({
			uri: "file:///old.png",
			width: 800,
			height: 600,
		});
	});

	it("ignores an image without a size", async () => {
		const { picker } = fakePicker({
			canceled: false,
			assets: [{ uri: "file:///x.jpg", width: 0, height: 0 }],
		});
		await expect(pickImage(picker)).resolves.toBeNull();
	});

	it("lets a picker failure through, for the form to report", async () => {
		const picker = {
			launchImageLibraryAsync: () =>
				Promise.reject(new Error("Missing photo library permission")),
		} as ImagePicker;
		await expect(pickImage(picker)).rejects.toThrow("permission");
	});
});

describe("downscaling", () => {
	it("fits the longest edge, never enlarges", () => {
		expect(fitWithin({ width: 4032, height: 3024 }, 2560)).toEqual({
			width: 2560,
			height: 1920,
		});
		expect(fitWithin({ width: 3024, height: 4032 }, 2560)).toEqual({
			width: 1920,
			height: 2560,
		});
		expect(fitWithin({ width: 800, height: 600 }, 2560)).toEqual({
			width: 800,
			height: 600,
		});
	});

	it("flattens at the editor's pixel size, at most the image's own and 2560", () => {
		// A 12 MP photo shown 369 × 277 pt on a 3× phone.
		expect(
			targetPixels({ width: 369, height: 277 }, 3, {
				width: 4032,
				height: 3024,
			}),
		).toEqual({ width: 1107, height: 831 });
		// A small image is not blown up to the screen's density.
		expect(
			targetPixels({ width: 369, height: 277 }, 3, { width: 640, height: 480 }),
		).toEqual({ width: 640, height: 480 });
		// A large tablet canvas stops at MAX_IMAGE_EDGE.
		const tablet = targetPixels({ width: 1000, height: 1340 }, 2, {
			width: 6000,
			height: 8040,
		});
		expect(Math.max(tablet.width, tablet.height)).toBe(MAX_IMAGE_EDGE);
	});

	it("gives react-native-view-shot points on iOS and pixels on Android", () => {
		const pixels = { width: 1107, height: 831 };
		expect(captureDimensions(pixels, "ios", 3)).toEqual({
			width: 369,
			height: 277,
		});
		expect(captureDimensions(pixels, "android", 2.625)).toEqual(pixels);
	});
});

describe("size limits", () => {
	it("keeps the first encoding that fits the budget", async () => {
		const encode = vi.fn(async () => jpeg(900_000));
		const dataUrl = await encodeWithinLimit(
			{ width: 1107, height: 2400 },
			encode,
		);
		expect(dataUrlBytes(dataUrl)).toBe(900_000);
		expect(encode).toHaveBeenCalledOnce();
		expect(encode).toHaveBeenCalledWith({
			width: 1107,
			height: 2400,
			quality: 0.85,
		});
	});

	it("lowers the quality, then the size, until it fits", async () => {
		const sizes = [6_000_000, 5_000_000, 3_000_000];
		const encode = vi.fn(
			async (_options: { width: number; height: number; quality: number }) =>
				jpeg(sizes.shift() ?? 0),
		);
		const dataUrl = await encodeWithinLimit(
			{ width: 2000, height: 1000 },
			encode,
		);
		expect(dataUrlBytes(dataUrl)).toBe(3_000_000);
		expect(encode.mock.calls.map(([options]) => options)).toEqual([
			{ width: 2000, height: 1000, quality: 0.85 },
			{ width: 2000, height: 1000, quality: 0.7 },
			{ width: 1500, height: 750, quality: 0.7 },
		]);
	});

	it("gives up with ImageTooLarge when nothing fits", async () => {
		const encode = vi.fn(async () => jpeg(IMAGE_BUDGET_BYTES + 3));
		await expect(
			encodeWithinLimit({ width: 4000, height: 3000 }, encode),
		).rejects.toBeInstanceOf(ImageTooLarge);
		expect(encode).toHaveBeenCalledTimes(ENCODE_STEPS.length);
	});

	it("keeps a chosen image within what the server accepts", async () => {
		const screenshot = await encodeWithinLimit(
			{ width: 2560, height: 1920 },
			// The budget, rounded down to whole base64 groups.
			async () => jpeg(IMAGE_BUDGET_BYTES - 1),
		);
		const payload = buildPayload({
			projectKey: "pk_test",
			type: "bug",
			message: "Wrong total on the cart screen",
			screenshot,
			user: null,
			context: null,
			screen: "Settings",
		});
		// The chosen image is sent as the report's screenshot.
		expect(payload.screenshot).toBe(screenshot);
		expect(payloadProblem(payload)).toBeNull();
	});
});
