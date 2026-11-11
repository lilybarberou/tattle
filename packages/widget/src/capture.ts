import { toCanvas } from "html-to-image";
import { internalInit, internalState } from "./internal";

export const DEFAULT_MASK_SELECTORS = [
	"input[type=password]",
	"[data-tattle-mask]",
	'input[autocomplete^="cc-"]',
];

const MASK_COLOR = "#9ca3af";
const TRANSPARENT_PIXEL =
	"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export interface Capture {
	/** Captured pixels (CSS size × pixel ratio), sensitive areas already masked. */
	canvas: HTMLCanvasElement;
	/** Viewport size in CSS pixels. */
	width: number;
	height: number;
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

function isTransparent(color: string): boolean {
	return !color || color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color);
}

function pageBackground(): string {
	for (const el of [document.body, document.documentElement]) {
		if (!el) continue;
		const bg = getComputedStyle(el).backgroundColor;
		if (!isTransparent(bg)) return bg;
	}
	return "#ffffff";
}

function collectMaskRects(
	selectors: string[],
	host: Element,
	vw: number,
	vh: number,
): Rect[] {
	const rects: Rect[] = [];
	for (const selector of selectors) {
		let nodes: NodeListOf<Element>;
		try {
			nodes = document.querySelectorAll(selector);
		} catch {
			continue; // invalid selector supplied by the host
		}
		for (const node of Array.from(nodes)) {
			if (host.contains(node)) continue;
			const r = node.getBoundingClientRect();
			if (r.width <= 0 || r.height <= 0) continue;
			const x = Math.max(0, r.left);
			const y = Math.max(0, r.top);
			const w = Math.min(vw, r.right) - x;
			const h = Math.min(vh, r.bottom) - y;
			if (w > 0 && h > 0) rects.push({ x, y, w, h });
		}
	}
	return rects;
}

/**
 * Captures the visible part of the page (current scroll position) into a
 * canvas. The widget host is excluded and every element matching a mask
 * selector is painted over with a solid block. The live page is never
 * modified: all work happens on html-to-image's clone and on the output canvas.
 */
export async function captureViewport(
	host: Element,
	extraMaskSelectors: string[] = [],
): Promise<Capture> {
	const root = document.documentElement;
	const width = root.clientWidth || window.innerWidth;
	const height =
		(document.compatMode === "CSS1Compat" && root.clientHeight) ||
		window.innerHeight;
	const scrollX = window.scrollX || root.scrollLeft || 0;
	const scrollY = window.scrollY || root.scrollTop || 0;
	const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
	const rootStyle = getComputedStyle(root);
	const maskRects = collectMaskRects(
		[...DEFAULT_MASK_SELECTORS, ...extraMaskSelectors],
		host,
		width,
		height,
	);

	internalState.capturing++;
	let canvas: HTMLCanvasElement;
	try {
		canvas = await toCanvas(root, {
			width,
			height,
			pixelRatio,
			backgroundColor: pageBackground(),
			cacheBust: false,
			imagePlaceholder: TRANSPARENT_PIXEL,
			fetchRequestInit: internalInit({ cache: "force-cache" }),
			filter: (node) => node !== host,
			// The clone keeps its real size and is pulled up/left by the scroll
			// offset so the SVG viewport (width × height) shows what is on screen.
			// A negative margin is used (not a transform, which would become the
			// containing block of position:fixed elements and move them; relative
			// `top` on the root is ignored inside the foreignObject).
			style: {
				width: rootStyle.width,
				height: rootStyle.height,
				overflow: "visible",
				marginTop: `${(Number.parseFloat(rootStyle.marginTop) || 0) - scrollY}px`,
				marginLeft: `${(Number.parseFloat(rootStyle.marginLeft) || 0) - scrollX}px`,
			},
		});
	} finally {
		internalState.capturing--;
	}

	const ctx = canvas.getContext("2d");
	if (ctx && maskRects.length) {
		const sx = canvas.width / width;
		const sy = canvas.height / height;
		ctx.save();
		ctx.fillStyle = MASK_COLOR;
		for (const r of maskRects) {
			ctx.fillRect(
				Math.floor(r.x * sx) - 1,
				Math.floor(r.y * sy) - 1,
				Math.ceil(r.w * sx) + 2,
				Math.ceil(r.h * sy) + 2,
			);
		}
		ctx.restore();
	}
	return { canvas, width, height };
}
