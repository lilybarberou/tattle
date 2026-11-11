import type { Capture } from "./capture";
import type { Strings } from "./i18n";
import { h, iconButton, trapTab } from "./ui/dom";
import { icons } from "./ui/icons";

export type Tool = "rect" | "ellipse" | "arrow" | "pen" | "blur";

/** Coordinates are in CSS pixels of the captured viewport. */
export type Shape =
	| {
			tool: "rect" | "ellipse" | "arrow" | "blur";
			x1: number;
			y1: number;
			x2: number;
			y2: number;
	  }
	| { tool: "pen"; points: number[] };

export interface AnnotationResult {
	dataUrl: string;
	shapes: Shape[];
}

const STROKE = "#ef4444";
const STROKE_WIDTH = 4;
const BLUR_BLOCK = 10;
const MAX_OUTPUT_WIDTH = 1920;
const JPEG_QUALITY = 0.85;
const TOOLS: Tool[] = ["rect", "ellipse", "arrow", "pen", "blur"];

/** Pixelates a region of whatever is already painted on `ctx` (device pixels). */
function pixelate(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	block: number,
): void {
	const cw = ctx.canvas.width;
	const ch = ctx.canvas.height;
	const sx = Math.max(0, Math.floor(x));
	const sy = Math.max(0, Math.floor(y));
	const sw = Math.min(cw, Math.ceil(x + w)) - sx;
	const sh = Math.min(ch, Math.ceil(y + h)) - sy;
	if (sw < 1 || sh < 1) return;
	const tiny = document.createElement("canvas");
	tiny.width = Math.max(1, Math.ceil(sw / block));
	tiny.height = Math.max(1, Math.ceil(sh / block));
	const tctx = tiny.getContext("2d");
	if (!tctx) return;
	tctx.imageSmoothingEnabled = true;
	tctx.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, tiny.width, tiny.height);
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, sx, sy, sw, sh);
	ctx.restore();
}

function drawShape(
	ctx: CanvasRenderingContext2D,
	shape: Shape,
	k: number,
): void {
	ctx.save();
	ctx.setTransform(k, 0, 0, k, 0, 0);
	ctx.strokeStyle = STROKE;
	ctx.fillStyle = STROKE;
	ctx.lineWidth = STROKE_WIDTH;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	if (shape.tool === "pen") {
		const p = shape.points;
		if (p.length >= 2) {
			ctx.beginPath();
			ctx.moveTo(p[0] as number, p[1] as number);
			if (p.length === 2) ctx.lineTo((p[0] as number) + 0.01, p[1] as number);
			for (let i = 2; i + 1 < p.length; i += 2)
				ctx.lineTo(p[i] as number, p[i + 1] as number);
			ctx.stroke();
		}
		ctx.restore();
		return;
	}
	const { x1, y1, x2, y2 } = shape;
	const x = Math.min(x1, x2);
	const y = Math.min(y1, y2);
	const w = Math.abs(x2 - x1);
	const hgt = Math.abs(y2 - y1);
	switch (shape.tool) {
		case "rect":
			ctx.strokeRect(x, y, w, hgt);
			break;
		case "ellipse":
			ctx.beginPath();
			ctx.ellipse(x + w / 2, y + hgt / 2, w / 2, hgt / 2, 0, 0, Math.PI * 2);
			ctx.stroke();
			break;
		case "arrow": {
			const angle = Math.atan2(y2 - y1, x2 - x1);
			const len = Math.hypot(x2 - x1, y2 - y1);
			const head = Math.min(len, Math.max(16, STROKE_WIDTH * 4.5));
			const bx = x2 - head * 0.8 * Math.cos(angle);
			const by = y2 - head * 0.8 * Math.sin(angle);
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(bx, by);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(x2, y2);
			ctx.lineTo(
				x2 - head * Math.cos(angle - Math.PI / 7),
				y2 - head * Math.sin(angle - Math.PI / 7),
			);
			ctx.lineTo(
				x2 - head * Math.cos(angle + Math.PI / 7),
				y2 - head * Math.sin(angle + Math.PI / 7),
			);
			ctx.closePath();
			ctx.fill();
			break;
		}
		case "blur":
			pixelate(ctx, x * k, y * k, w * k, hgt * k, Math.max(4, BLUR_BLOCK * k));
			break;
	}
	ctx.restore();
}

/** Paints the screenshot then every shape onto `canvas` (whose size sets the scale). */
function render(
	canvas: HTMLCanvasElement,
	capture: Capture,
	shapes: Shape[],
): void {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(capture.canvas, 0, 0, canvas.width, canvas.height);
	const k = canvas.width / capture.width;
	for (const shape of shapes) drawShape(ctx, shape, k);
}

/** Flattens annotations into a JPEG data URL (max 1920px wide). */
export function flatten(capture: Capture, shapes: Shape[]): string {
	const out = document.createElement("canvas");
	out.width = Math.min(capture.canvas.width, MAX_OUTPUT_WIDTH);
	out.height = Math.max(
		1,
		Math.round((out.width * capture.height) / capture.width),
	);
	render(out, capture, shapes);
	return out.toDataURL("image/jpeg", JPEG_QUALITY);
}

function isTiny(shape: Shape): boolean {
	if (shape.tool === "pen") return false;
	return Math.abs(shape.x2 - shape.x1) < 3 && Math.abs(shape.y2 - shape.y1) < 3;
}

/**
 * Opens the full-screen annotation editor inside `mount` (the widget's shadow
 * root container). Resolves with the flattened image, or null on cancel.
 */
export function openAnnotator(
	mount: HTMLElement,
	capture: Capture,
	initialShapes: Shape[],
	t: Strings,
	getActive: () => Element | null,
): { result: Promise<AnnotationResult | null>; cancel: () => void } {
	const shapes: Shape[] = initialShapes.slice();
	let tool: Tool = "rect";
	let current: Shape | null = null;
	let scale = 1;
	let frame = 0;

	const canvas = h("canvas", {
		class: "fb-editor-canvas",
		"aria-label": t.editorLabel,
		role: "img",
	});
	const toolButtons = new Map<Tool, HTMLButtonElement>();
	const labels: Record<Tool, string> = {
		rect: t.toolRect,
		ellipse: t.toolEllipse,
		arrow: t.toolArrow,
		pen: t.toolPen,
		blur: t.toolBlur,
	};
	for (const name of TOOLS) {
		toolButtons.set(
			name,
			iconButton(icons[name], labels[name], "fb-tool", {
				"aria-pressed": String(name === tool),
			}),
		);
	}
	const undoBtn = iconButton(icons.undo, t.undo, "fb-tool");
	const clearBtn = iconButton(icons.clear, t.clear, "fb-tool");
	const cancelBtn = h(
		"button",
		{ type: "button", class: "fb-btn fb-btn-ghost" },
		t.cancel,
	);
	const doneBtn = h(
		"button",
		{ type: "button", class: "fb-btn fb-btn-primary", html: icons.check },
		t.done,
	);
	const toolbar = h(
		"div",
		{ class: "fb-toolbar", role: "toolbar", "aria-label": t.editorLabel },
		h("div", { class: "fb-toolgroup" }, ...toolButtons.values()),
		h("span", { class: "fb-sep", "aria-hidden": "true" }),
		h("div", { class: "fb-toolgroup" }, undoBtn, clearBtn),
		h("span", { class: "fb-sep", "aria-hidden": "true" }),
		h("div", { class: "fb-toolgroup" }, cancelBtn, doneBtn),
	);
	const editor = h(
		"div",
		{
			class: "fb-editor",
			role: "dialog",
			"aria-modal": "true",
			"aria-label": t.editorLabel,
			tabindex: -1,
		},
		canvas,
		toolbar,
	);

	const updateButtons = () => {
		for (const [name, btn] of toolButtons)
			btn.setAttribute("aria-pressed", String(name === tool));
		undoBtn.disabled = shapes.length === 0;
		clearBtn.disabled = shapes.length === 0;
	};

	const redraw = () => {
		frame = 0;
		render(canvas, capture, current ? [...shapes, current] : shapes);
	};
	const schedule = () => {
		if (!frame) frame = requestAnimationFrame(redraw);
	};

	const layout = () => {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		scale = Math.min(vw / capture.width, vh / capture.height);
		const cssW = capture.width * scale;
		const cssH = capture.height * scale;
		const dpr = Math.min(window.devicePixelRatio || 1, 3);
		canvas.width = Math.round(cssW * dpr);
		canvas.height = Math.round(cssH * dpr);
		canvas.style.width = `${cssW}px`;
		canvas.style.height = `${cssH}px`;
		canvas.style.left = `${(vw - cssW) / 2}px`;
		canvas.style.top = `${(vh - cssH) / 2}px`;
		redraw();
	};

	const toImage = (event: PointerEvent): [number, number] => {
		const r = canvas.getBoundingClientRect();
		const x = Math.min(
			capture.width,
			Math.max(0, (event.clientX - r.left) / scale),
		);
		const y = Math.min(
			capture.height,
			Math.max(0, (event.clientY - r.top) / scale),
		);
		return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
	};

	let pointerId: number | null = null;
	const onDown = (event: PointerEvent) => {
		if (
			pointerId !== null ||
			(event.pointerType === "mouse" && event.button !== 0)
		)
			return;
		event.preventDefault();
		pointerId = event.pointerId;
		canvas.setPointerCapture(event.pointerId);
		const [x, y] = toImage(event);
		current =
			tool === "pen"
				? { tool, points: [x, y] }
				: { tool, x1: x, y1: y, x2: x, y2: y };
		schedule();
	};
	const onMove = (event: PointerEvent) => {
		if (event.pointerId !== pointerId || !current) return;
		const [x, y] = toImage(event);
		if (current.tool === "pen") current.points.push(x, y);
		else {
			current.x2 = x;
			current.y2 = y;
		}
		schedule();
	};
	const onUp = (event: PointerEvent) => {
		if (event.pointerId !== pointerId) return;
		pointerId = null;
		if (canvas.hasPointerCapture(event.pointerId))
			canvas.releasePointerCapture(event.pointerId);
		if (current && event.type === "pointerup" && !isTiny(current))
			shapes.push(current);
		current = null;
		updateButtons();
		schedule();
	};

	canvas.addEventListener("pointerdown", onDown);
	canvas.addEventListener("pointermove", onMove);
	canvas.addEventListener("pointerup", onUp);
	canvas.addEventListener("pointercancel", onUp);

	for (const [name, btn] of toolButtons) {
		btn.addEventListener("click", () => {
			tool = name;
			updateButtons();
		});
	}
	undoBtn.addEventListener("click", () => {
		shapes.pop();
		updateButtons();
		schedule();
	});
	clearBtn.addEventListener("click", () => {
		shapes.length = 0;
		updateButtons();
		schedule();
	});

	let settle: (value: AnnotationResult | null) => void = () => {};
	const result = new Promise<AnnotationResult | null>((resolve) => {
		settle = resolve;
	});
	let closed = false;
	const close = (value: AnnotationResult | null) => {
		if (closed) return;
		closed = true;
		if (frame) cancelAnimationFrame(frame);
		window.removeEventListener("resize", layout);
		editor.remove();
		settle(value);
	};

	const onKey = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close(null);
		} else if (
			(event.metaKey || event.ctrlKey) &&
			event.key.toLowerCase() === "z"
		) {
			event.preventDefault();
			undoBtn.click();
		} else {
			trapTab(event, editor, getActive());
		}
	};
	editor.addEventListener("keydown", onKey);
	cancelBtn.addEventListener("click", () => close(null));
	doneBtn.addEventListener("click", () =>
		close({ dataUrl: flatten(capture, shapes), shapes: shapes.slice() }),
	);
	window.addEventListener("resize", layout);

	mount.append(editor);
	updateButtons();
	layout();
	toolButtons.get("rect")?.focus();

	return { result, cancel: () => close(null) };
}
