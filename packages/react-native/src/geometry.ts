export type Tool = "rect" | "ellipse" | "arrow" | "pen" | "blur";

/** Coordinates are in points of the annotation canvas. */
export type Shape =
	| {
			tool: "rect" | "ellipse" | "arrow" | "blur";
			x1: number;
			y1: number;
			x2: number;
			y2: number;
	  }
	| { tool: "pen"; points: number[] };

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The box between two corners, whichever way the user dragged. */
export function boxOf(shape: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}): Box {
	return {
		x: Math.min(shape.x1, shape.x2),
		y: Math.min(shape.y1, shape.y2),
		width: Math.abs(shape.x2 - shape.x1),
		height: Math.abs(shape.y2 - shape.y1),
	};
}

/** The two far corners of an arrow head at (x2, y2), as an SVG points string. */
export function arrowHead(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	size = 16,
): string {
	const angle = Math.atan2(y2 - y1, x2 - x1);
	const spread = Math.PI / 7;
	const a = {
		x: x2 - size * Math.cos(angle - spread),
		y: y2 - size * Math.sin(angle - spread),
	};
	const b = {
		x: x2 - size * Math.cos(angle + spread),
		y: y2 - size * Math.sin(angle + spread),
	};
	const round = (n: number) => Math.round(n * 10) / 10;
	return `${round(x2)},${round(y2)} ${round(a.x)},${round(a.y)} ${round(b.x)},${round(b.y)}`;
}

/** An SVG path through a pen stroke's points (x, y pairs). */
export function penPath(points: number[]): string {
	if (points.length < 2) return "";
	const [x0 = 0, y0 = 0] = points;
	let d = `M${x0} ${y0}`;
	if (points.length === 2) return `${d} L${x0 + 0.01} ${y0}`;
	for (let i = 2; i + 1 < points.length; i += 2)
		d += ` L${points[i]} ${points[i + 1]}`;
	return d;
}

/** Too small to be intended: a tap, not a drag. */
export function isTiny(shape: Shape): boolean {
	if (shape.tool === "pen") return shape.points.length < 4;
	const { width, height } = boxOf(shape);
	return shape.tool === "arrow"
		? Math.hypot(width, height) < 8
		: width < 4 || height < 4;
}

/** The largest size with the image's aspect ratio that fits in the area. */
export function fitContain(
	image: { width: number; height: number },
	area: { width: number; height: number },
): { width: number; height: number } {
	if (
		image.width <= 0 ||
		image.height <= 0 ||
		area.width <= 0 ||
		area.height <= 0
	)
		return { width: 0, height: 0 };
	const scale = Math.min(area.width / image.width, area.height / image.height);
	return {
		width: Math.floor(image.width * scale),
		height: Math.floor(image.height * scale),
	};
}
