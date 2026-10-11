import {
	Dispatch,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
} from "react";
import { Box, Center, isLightColor, useMantineTheme } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import Konva from "konva";
import {
	Ellipse,
	Group,
	Image as KonvaImage,
	Layer,
	Rect,
	Stage,
	Text,
	Transformer,
} from "react-konva";
import {
	MaskShape,
	OcclusionShape,
	TextShape,
} from "../../../api/imageOcclusion/dto/occlusionShape";
import { isMask, targetKeyOf, targetKeys } from "../utils/occlusionTargets";
import {
	LABEL_FONT_FAMILY,
	LABEL_LINE_HEIGHT,
} from "../utils/occlusionLabelFont";
import { OcclusionEditorAction, OcclusionTool } from "./occlusionEditorReducer";
import LabelTextEditor from "./LabelTextEditor";

const MIN_DRAW_SIZE = 4;
const DEFAULT_FONT_SIZE = 0.04;

interface OcclusionCanvasProps {
	image: HTMLImageElement;
	shapes: OcclusionShape[];
	selectedIds: string[];
	tool: OcclusionTool;
	color: string;
	dispatch: Dispatch<OcclusionEditorAction>;
}

interface Draft {
	kind: "rect" | "ellipse";
	startX: number;
	startY: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

export default function OcclusionCanvas({
	image,
	shapes,
	selectedIds,
	tool,
	color,
	dispatch,
}: OcclusionCanvasProps) {
	const theme = useMantineTheme();
	const accent = theme.colors[theme.primaryColor][6];
	const { ref: containerRef, width, height } = useElementSize();
	const iw = image.naturalWidth;
	const ih = image.naturalHeight;
	const scale = width && height ? Math.min(width / iw, height / ih) : 0;

	const nodeRefs = useRef(new Map<string, Konva.Node>());
	const stageRef = useRef<Konva.Stage>(null);
	const transformerRef = useRef<Konva.Transformer>(null);
	// The Transformer drags every selected node, each ending with its own dragend; only the first commits.
	const dragPending = useRef(false);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const editing = shapes.find(
		(shape): shape is TextShape =>
			shape.id === editingId && shape.kind === "text",
	);

	const keys = useMemo(() => targetKeys(shapes), [shapes]);

	useEffect(() => {
		const nodes = selectedIds
			// The label being typed into shows its own outline instead of handles.
			.filter(id => id !== editingId)
			.map(id => nodeRefs.current.get(id))
			.filter((node): node is Konva.Node => !!node);
		// Handles only while selecting; a drawing tool keeps drawing over them.
		transformerRef.current?.nodes(tool === "select" ? nodes : []);
	}, [selectedIds, shapes, scale, tool, editingId]);

	const pointerInImage = (stage: Konva.Stage) => {
		const pointer = stage.getPointerPosition();
		if (!pointer) return null;
		return {
			x: Math.min(Math.max(pointer.x / scale, 0), iw),
			y: Math.min(Math.max(pointer.y / scale, 0), ih),
		};
	};

	const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
		const stage = event.target.getStage();
		if (!stage) return;
		const point = pointerInImage(stage);
		if (!point) return;

		if (tool === "rect" || tool === "ellipse") {
			setDraft({
				kind: tool,
				startX: point.x,
				startY: point.y,
				...point,
				width: 0,
				height: 0,
			});
			return;
		}
		if (tool === "text") {
			// Stops this click from moving focus off the label editor that opens below.
			event.evt.preventDefault();
			const id = crypto.randomUUID();
			dispatch({
				type: "add",
				shape: {
					kind: "text",
					id,
					x: point.x / iw,
					y: point.y / ih,
					rotation: 0,
					text: "Label",
					fontSize: DEFAULT_FONT_SIZE,
					color,
				},
			});
			// Typed into right away, like any drawing app's text tool.
			setEditingId(id);
			return;
		}
		if (event.target === stage || event.target.name() === "background") {
			dispatch({ type: "select", ids: [] });
		}
	};

	const resizeDraft = useEffectEvent((event: PointerEvent) => {
		const stage = stageRef.current;
		if (!draft || !stage) return;
		stage.setPointersPositions(event);
		const point = pointerInImage(stage);
		if (!point) return;
		setDraft({
			...draft,
			x: Math.min(draft.startX, point.x),
			y: Math.min(draft.startY, point.y),
			width: Math.abs(point.x - draft.startX),
			height: Math.abs(point.y - draft.startY),
		});
	});

	const finishDraft = useEffectEvent(() => {
		if (!draft) return;
		setDraft(null);
		if (draft.width < MIN_DRAW_SIZE || draft.height < MIN_DRAW_SIZE) return;
		dispatch({
			type: "add",
			shape: {
				kind: draft.kind,
				id: crypto.randomUUID(),
				x: draft.x / iw,
				y: draft.y / ih,
				width: draft.width / iw,
				height: draft.height / ih,
				rotation: 0,
				fill: color,
				groupId: null,
			},
		});
	});

	// Tracked on the window, so a drag released past the image's edge still lands its mask.
	const drafting = draft !== null;
	useEffect(() => {
		if (!drafting) return;
		const move = (event: PointerEvent) => resizeDraft(event);
		const up = () => finishDraft();
		const cancel = () => setDraft(null);
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", cancel);
		return () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", cancel);
		};
	}, [drafting]);

	const selectShape = (id: string, additive: boolean) => {
		if (tool !== "select") return;
		dispatch(
			additive
				? { type: "toggleSelect", id }
				: { type: "select", ids: [id] },
		);
	};

	/** Reads a node's on-canvas geometry back into a normalized shape. */
	const shapeFromNode = (
		shape: OcclusionShape,
		node: Konva.Node,
	): OcclusionShape => {
		const scaleX = node.scaleX();
		const scaleY = node.scaleY();
		node.scale({ x: 1, y: 1 });
		const base = {
			x: node.x() / iw,
			y: node.y() / ih,
			rotation: node.rotation(),
		};
		if (isMask(shape)) {
			return {
				...shape,
				...base,
				width: shape.width * scaleX,
				height: shape.height * scaleY,
			};
		}
		return { ...shape, ...base, fontSize: shape.fontSize * scaleY };
	};

	const commitSelected = () => {
		const updated = shapes
			.filter(shape => selectedIds.includes(shape.id))
			.map(shape => {
				const node = nodeRefs.current.get(shape.id);
				return node ? shapeFromNode(shape, node) : shape;
			});
		dispatch({ type: "update", shapes: updated });
	};

	const handleDragStart = (id: string) => {
		if (!selectedIds.includes(id)) dispatch({ type: "select", ids: [id] });
		dragPending.current = true;
	};

	const handleDragEnd = (id: string) => {
		if (!dragPending.current) return;
		dragPending.current = false;
		const ids = selectedIds.includes(id) ? selectedIds : [id];
		const updated = shapes
			.filter(shape => ids.includes(shape.id))
			.map(shape => {
				const node = nodeRefs.current.get(shape.id);
				return node ? shapeFromNode(shape, node) : shape;
			});
		dispatch({ type: "update", shapes: updated });
	};

	const registerNode = (id: string) => (node: Konva.Node | null) => {
		if (node) nodeRefs.current.set(id, node);
		else nodeRefs.current.delete(id);
	};

	const commonProps = (shape: OcclusionShape): NodeProps => ({
		ref: registerNode(shape.id),
		x: shape.x * iw,
		y: shape.y * ih,
		rotation: shape.rotation,
		draggable: tool === "select",
		onPointerDown: (event: Konva.KonvaEventObject<PointerEvent>) => {
			// The text tool edits the label it lands on instead of stacking a new one.
			if (tool === "text" && shape.kind === "text") {
				event.cancelBubble = true;
				// Stops this click from moving focus off the label editor that opens below.
				event.evt.preventDefault();
				dispatch({ type: "select", ids: [shape.id] });
				setEditingId(shape.id);
				return;
			}
			if (tool !== "select") return;
			event.cancelBubble = true;
			selectShape(shape.id, event.evt.shiftKey);
		},
		onDragStart: () => handleDragStart(shape.id),
		onDragEnd: () => handleDragEnd(shape.id),
	});

	return (
		<Center
			ref={containerRef}
			w="100%"
			h="100%"
			style={{ overflow: "hidden" }}>
			{scale > 0 && (
				<Box pos="relative">
					<Stage
						ref={stageRef}
						width={iw * scale}
						height={ih * scale}
						scaleX={scale}
						scaleY={scale}
						style={{
							cursor: TOOL_CURSORS[tool],
							touchAction: "none",
						}}
						onPointerDown={handlePointerDown}>
						<Layer>
							<KonvaImage
								name="background"
								image={image}
								width={iw}
								height={ih}
							/>
							{shapes.map(shape =>
								isMask(shape) ? (
									<MaskNode
										key={shape.id}
										shape={shape}
										iw={iw}
										ih={ih}
										scale={scale}
										cardNumber={
											keys.indexOf(targetKeyOf(shape)) + 1
										}
										{...commonProps(shape)}
									/>
								) : (
									<TextNode
										key={shape.id}
										shape={shape}
										ih={ih}
										visible={shape.id !== editingId}
										onStartEdit={() =>
											tool === "select" &&
											setEditingId(shape.id)
										}
										{...commonProps(shape)}
									/>
								),
							)}
							{draft && (
								<DraftNode
									draft={draft}
									color={color}
									accent={accent}
									scale={scale}
								/>
							)}
							<Transformer
								ref={transformerRef}
								rotateEnabled
								// A flip would store negative sizes, which SVG won't draw in review.
								flipEnabled={false}
								borderStroke={accent}
								anchorStroke={accent}
								anchorSize={10}
								ignoreStroke
								onTransformEnd={commitSelected}
							/>
						</Layer>
					</Stage>
					{editing && (
						<LabelTextEditor
							key={editing.id}
							shape={editing}
							iw={iw}
							ih={ih}
							scale={scale}
							accent={accent}
							onCommit={text =>
								dispatch({
									type: "update",
									shapes: [{ ...editing, text }],
								})
							}
							onClose={() =>
								setEditingId(current =>
									current === editing.id ? null : current,
								)
							}
						/>
					)}
				</Box>
			)}
		</Center>
	);
}

const TOOL_CURSORS: Record<OcclusionTool, string> = {
	select: "default",
	rect: "crosshair",
	ellipse: "crosshair",
	text: "text",
};

interface NodeProps {
	ref: (node: Konva.Node | null) => void;
	x: number;
	y: number;
	rotation: number;
	draggable: boolean;
	onPointerDown: (event: Konva.KonvaEventObject<PointerEvent>) => void;
	onDragStart: () => void;
	onDragEnd: () => void;
}

function MaskNode({
	shape,
	iw,
	ih,
	scale,
	cardNumber,
	...nodeProps
}: NodeProps & {
	shape: MaskShape;
	iw: number;
	ih: number;
	scale: number;
	cardNumber: number;
}) {
	const width = shape.width * iw;
	const height = shape.height * ih;
	const fill = {
		fill: shape.fill,
		stroke: "#2d2d2d",
		strokeWidth: 1 / scale,
		dash: shape.groupId ? [6 / scale, 4 / scale] : undefined,
	};
	const labelSize = 14 / scale;

	return (
		<Group {...nodeProps}>
			{shape.kind === "rect" ? (
				<Rect
					width={width}
					height={height}
					cornerRadius={4 / scale}
					{...fill}
				/>
			) : (
				<Ellipse
					x={width / 2}
					y={height / 2}
					radiusX={width / 2}
					radiusY={height / 2}
					{...fill}
				/>
			)}
			<Text
				text={String(cardNumber)}
				width={width}
				height={height}
				align="center"
				verticalAlign="middle"
				fontSize={labelSize}
				fontStyle="bold"
				// Contrasts with the mask, so a dark swatch's number stays readable.
				fill={isLightColor(shape.fill) ? "#2d2d2d" : "#ffffff"}
				listening={false}
			/>
		</Group>
	);
}

function TextNode({
	shape,
	ih,
	visible,
	onStartEdit,
	...nodeProps
}: NodeProps & {
	shape: TextShape;
	ih: number;
	visible: boolean;
	onStartEdit: () => void;
}) {
	return (
		<Text
			{...nodeProps}
			visible={visible}
			onDblClick={onStartEdit}
			onDblTap={onStartEdit}
			text={shape.text}
			fontSize={shape.fontSize * ih}
			fill={shape.color}
			fontFamily={LABEL_FONT_FAMILY}
			fontStyle="bold"
			lineHeight={LABEL_LINE_HEIGHT}
		/>
	);
}

function DraftNode({
	draft,
	color,
	accent,
	scale,
}: {
	draft: Draft;
	color: string;
	accent: string;
	scale: number;
}) {
	const style = {
		fill: color,
		opacity: 0.7,
		stroke: accent,
		strokeWidth: 1 / scale,
		listening: false,
	};
	return draft.kind === "rect" ? (
		<Rect
			x={draft.x}
			y={draft.y}
			width={draft.width}
			height={draft.height}
			{...style}
		/>
	) : (
		<Ellipse
			x={draft.x + draft.width / 2}
			y={draft.y + draft.height / 2}
			radiusX={draft.width / 2}
			radiusY={draft.height / 2}
			{...style}
		/>
	);
}
