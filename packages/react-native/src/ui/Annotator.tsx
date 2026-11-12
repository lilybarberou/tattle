import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Image,
	type LayoutChangeEvent,
	PanResponder,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Svg, { Ellipse, Line, Path, Polygon, Rect } from "react-native-svg";
import { captureView, type ViewRef } from "../capture";
import {
	arrowHead,
	boxOf,
	fitContain,
	isTiny,
	penPath,
	type Shape,
	type Tool,
} from "../geometry";
import type { Strings } from "../i18n";
import { Icon, type IconName } from "./icons";
import { useInsets } from "./insets";
import { offset, type Theme } from "./theme";

const STROKE = "#ef4444";
const STROKE_WIDTH = 4;
const BLUR_RADIUS = 18;
const TOOLS: Array<{ tool: Tool; icon: IconName; label: keyof Strings }> = [
	{ tool: "rect", icon: "rect", label: "toolRect" },
	{ tool: "ellipse", icon: "ellipse", label: "toolEllipse" },
	{ tool: "arrow", icon: "arrow", label: "toolArrow" },
	{ tool: "pen", icon: "pen", label: "toolPen" },
	{ tool: "blur", icon: "blur", label: "toolBlur" },
];

export interface Annotation {
	/** Shapes in points of a canvas `canvasWidth` wide. */
	shapes: Shape[];
	canvasWidth: number;
}

function scaleShape(shape: Shape, k: number): Shape {
	if (k === 1) return shape;
	if (shape.tool === "pen")
		return { tool: "pen", points: shape.points.map((p) => p * k) };
	return {
		...shape,
		x1: shape.x1 * k,
		y1: shape.y1 * k,
		x2: shape.x2 * k,
		y2: shape.y2 * k,
	};
}

function Stroke({ shape }: { shape: Shape }) {
	if (shape.tool === "pen")
		return (
			<Path
				d={penPath(shape.points)}
				stroke={STROKE}
				strokeWidth={STROKE_WIDTH}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			/>
		);
	const box = boxOf(shape);
	switch (shape.tool) {
		case "rect":
			return (
				<Rect
					{...box}
					rx={3}
					stroke={STROKE}
					strokeWidth={STROKE_WIDTH}
					fill="none"
				/>
			);
		case "ellipse":
			return (
				<Ellipse
					cx={box.x + box.width / 2}
					cy={box.y + box.height / 2}
					rx={box.width / 2}
					ry={box.height / 2}
					stroke={STROKE}
					strokeWidth={STROKE_WIDTH}
					fill="none"
				/>
			);
		case "arrow":
			return (
				<>
					<Line
						x1={shape.x1}
						y1={shape.y1}
						x2={shape.x2}
						y2={shape.y2}
						stroke={STROKE}
						strokeWidth={STROKE_WIDTH}
						strokeLinecap="round"
					/>
					<Polygon
						points={arrowHead(shape.x1, shape.y1, shape.x2, shape.y2)}
						fill={STROKE}
						stroke={STROKE}
						strokeWidth={2}
						strokeLinejoin="round"
					/>
				</>
			);
		default:
			return null;
	}
}

/** A blurred copy of the screenshot, clipped to the shape's box. */
function BlurPatch({
	shape,
	uri,
	width,
	height,
}: {
	shape: Shape;
	uri: string;
	width: number;
	height: number;
}) {
	if (shape.tool !== "blur") return null;
	const box = boxOf(shape);
	return (
		<View
			pointerEvents="none"
			style={[
				styles.patch,
				{ left: box.x, top: box.y, width: box.width, height: box.height },
			]}
		>
			<Image
				source={{ uri }}
				blurRadius={BLUR_RADIUS}
				style={{
					position: "absolute",
					left: -box.x,
					top: -box.y,
					width,
					height,
				}}
			/>
		</View>
	);
}

/**
 * Full-screen editor: draws rectangles, circles, arrows, pen strokes and blurs
 * over the screenshot, then flattens them into a new JPEG.
 */
export function Annotator({
	uri,
	imageSize,
	initial,
	t,
	theme,
	onCancel,
	onDone,
}: {
	uri: string;
	imageSize: { width: number; height: number };
	initial: Annotation | null;
	t: Strings;
	theme: Theme;
	onCancel: () => void;
	onDone: (result: { dataUrl: string; annotation: Annotation }) => void;
}) {
	const insets = useInsets();
	const [area, setArea] = useState({ width: 0, height: 0 });
	const canvas = fitContain(imageSize, area);
	const [tool, setTool] = useState<Tool>("rect");
	const [shapes, setShapes] = useState<Shape[]>([]);
	const [draft, setDraft] = useState<Shape | null>(null);
	const [saving, setSaving] = useState(false);
	const canvasRef: ViewRef = useRef(null);
	const restored = useRef(false);

	// Restore earlier shapes once the canvas has a size, rescaled if it changed.
	useEffect(() => {
		if (restored.current || canvas.width === 0) return;
		restored.current = true;
		if (initial?.shapes.length) {
			const k = canvas.width / initial.canvasWidth;
			setShapes(initial.shapes.map((s) => scaleShape(s, k)));
		}
	}, [canvas.width, initial]);

	const live = useRef({ tool, canvas, draft });
	live.current = { tool, canvas, draft };

	const responder = useMemo(() => {
		let origin = { x: 0, y: 0, pageX: 0, pageY: 0 };
		const point = (pageX: number, pageY: number) => {
			const { width, height } = live.current.canvas;
			const x = Math.min(Math.max(origin.x + pageX - origin.pageX, 0), width);
			const y = Math.min(Math.max(origin.y + pageY - origin.pageY, 0), height);
			return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
		};
		return PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderTerminationRequest: () => false,
			onPanResponderGrant: (event) => {
				const e = event.nativeEvent;
				origin = {
					x: e.locationX,
					y: e.locationY,
					pageX: e.pageX,
					pageY: e.pageY,
				};
				const { x, y } = point(e.pageX, e.pageY);
				const current = live.current.tool;
				const next: Shape =
					current === "pen"
						? { tool: "pen", points: [x, y] }
						: { tool: current, x1: x, y1: y, x2: x, y2: y };
				live.current.draft = next;
				setDraft(next);
			},
			onPanResponderMove: (event) => {
				const shape = live.current.draft;
				if (!shape) return;
				const { x, y } = point(
					event.nativeEvent.pageX,
					event.nativeEvent.pageY,
				);
				const next: Shape =
					shape.tool === "pen"
						? { tool: "pen", points: [...shape.points, x, y] }
						: { ...shape, x2: x, y2: y };
				live.current.draft = next;
				setDraft(next);
			},
			onPanResponderRelease: () => {
				const shape = live.current.draft;
				live.current.draft = null;
				setDraft(null);
				if (shape && !isTiny(shape)) setShapes((list) => [...list, shape]);
			},
			onPanResponderTerminate: () => {
				live.current.draft = null;
				setDraft(null);
			},
		});
	}, []);

	const finish = async () => {
		if (saving) return;
		if (shapes.length === 0) {
			onDone({
				dataUrl: uri,
				annotation: { shapes: [], canvasWidth: canvas.width },
			});
			return;
		}
		setSaving(true);
		try {
			const dataUrl = await captureView(canvasRef, { mask: false });
			onDone({ dataUrl, annotation: { shapes, canvasWidth: canvas.width } });
		} catch {
			setSaving(false);
		}
	};

	const all = draft ? [...shapes, draft] : shapes;

	return (
		<View
			style={[
				styles.editor,
				{
					paddingTop: insets.top,
					paddingBottom: Math.max(insets.bottom, 12),
					paddingLeft: insets.left,
					paddingRight: insets.right,
				},
			]}
			accessibilityViewIsModal
		>
			<View style={styles.topBar}>
				<Pressable
					onPress={onCancel}
					accessibilityRole="button"
					hitSlop={8}
					style={styles.textButton}
				>
					<Text style={[styles.cancelText, theme.font("400")]}>{t.cancel}</Text>
				</Pressable>
				<Text
					style={[styles.title, theme.font("600")]}
					accessibilityRole="header"
				>
					{t.editorLabel}
				</Text>
				<Pressable
					onPress={finish}
					disabled={saving}
					accessibilityRole="button"
					hitSlop={8}
					style={[
						styles.doneButton,
						{
							backgroundColor: theme.accent,
							borderRadius: offset(theme.buttonRadius, -2),
						},
					]}
				>
					{saving ? (
						<ActivityIndicator size="small" color={theme.accentFg} />
					) : (
						<Text
							style={[
								styles.doneText,
								theme.font("600"),
								{ color: theme.accentFg },
							]}
						>
							{t.done}
						</Text>
					)}
				</Pressable>
			</View>

			<View
				style={styles.area}
				onLayout={(e: LayoutChangeEvent) =>
					setArea({
						width: e.nativeEvent.layout.width - 24,
						height: e.nativeEvent.layout.height - 24,
					})
				}
			>
				{canvas.width > 0 && (
					<View
						ref={canvasRef}
						collapsable={false}
						style={{ width: canvas.width, height: canvas.height }}
						{...responder.panHandlers}
					>
						<Image
							source={{ uri }}
							style={{ width: canvas.width, height: canvas.height }}
							accessibilityIgnoresInvertColors
						/>
						{all.map((shape, i) => (
							<BlurPatch
								// biome-ignore lint/suspicious/noArrayIndexKey: shapes are append-only
								key={i}
								shape={shape}
								uri={uri}
								width={canvas.width}
								height={canvas.height}
							/>
						))}
						<Svg
							pointerEvents="none"
							width={canvas.width}
							height={canvas.height}
							style={StyleSheet.absoluteFill}
						>
							{all.map((shape, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: shapes are append-only
								<Stroke key={i} shape={shape} />
							))}
						</Svg>
					</View>
				)}
			</View>

			<View style={[styles.toolbar, { borderRadius: theme.buttonRadius + 3 }]}>
				{TOOLS.map((item) => {
					const active = tool === item.tool;
					return (
						<Pressable
							key={item.tool}
							onPress={() => setTool(item.tool)}
							accessibilityRole="button"
							accessibilityLabel={t[item.label]}
							accessibilityState={{ selected: active }}
							style={[
								styles.tool,
								{ borderRadius: offset(theme.buttonRadius, -1) },
								active && { backgroundColor: theme.accent },
							]}
						>
							<Icon
								name={item.icon}
								color={active ? theme.accentFg : "#d4d4d8"}
							/>
						</Pressable>
					);
				})}
				<View style={styles.separator} />
				<Pressable
					onPress={() => setShapes((list) => list.slice(0, -1))}
					disabled={shapes.length === 0}
					accessibilityRole="button"
					accessibilityLabel={t.undo}
					style={[
						styles.tool,
						{ borderRadius: offset(theme.buttonRadius, -1) },
						shapes.length === 0 && styles.disabled,
					]}
				>
					<Icon name="undo" color="#d4d4d8" />
				</Pressable>
				<Pressable
					onPress={() => setShapes([])}
					disabled={shapes.length === 0}
					accessibilityRole="button"
					accessibilityLabel={t.clear}
					style={[
						styles.tool,
						{ borderRadius: offset(theme.buttonRadius, -1) },
						shapes.length === 0 && styles.disabled,
					]}
				>
					<Icon name="clear" color="#d4d4d8" />
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	editor: { flex: 1, backgroundColor: "#0b0b0e" },
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 10,
		gap: 12,
	},
	title: {
		flex: 1,
		textAlign: "center",
		color: "#f4f4f5",
		fontSize: 15,
	},
	textButton: { minWidth: 72, paddingVertical: 6 },
	cancelText: { color: "#d4d4d8", fontSize: 15 },
	doneButton: {
		minWidth: 72,
		minHeight: 34,
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	doneText: { fontSize: 15 },
	area: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 12,
	},
	patch: { position: "absolute", overflow: "hidden" },
	toolbar: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		alignItems: "center",
		alignSelf: "center",
		maxWidth: "100%",
		gap: 4,
		padding: 6,
		backgroundColor: "#18181b",
	},
	tool: {
		width: 42,
		height: 42,
		alignItems: "center",
		justifyContent: "center",
	},
	disabled: { opacity: 0.4 },
	separator: {
		width: 1,
		height: 24,
		marginHorizontal: 4,
		backgroundColor: "rgba(255, 255, 255, 0.14)",
	},
});
