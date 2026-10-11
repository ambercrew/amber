import { CSSProperties, useState } from "react";
import { ImageOcclusionResponseDto } from "../../../api/imageOcclusion/dto/imageOcclusionResponseDto";
import { MaskShape } from "../../../api/imageOcclusion/dto/occlusionShape";
import { isMask, maskTransform, targetKeyOf } from "../utils/occlusionTargets";
import OcclusionText from "./OcclusionText";

const PRIMARY = "var(--mantine-primary-color-filled)";
// The answer's dashes; each sits on a slightly longer white dash, outlining it on dark images too.
const ANSWER_DASH = { width: 3, dash: 8, gap: 6 };
const ANSWER_DASH_BORDER = 1;
const ANSWER_BORDER_STYLE = {
	fill: "none",
	stroke: "white",
	strokeWidth: ANSWER_DASH.width + 2 * ANSWER_DASH_BORDER,
	strokeDasharray: `${ANSWER_DASH.dash + 2 * ANSWER_DASH_BORDER} ${ANSWER_DASH.gap - 2 * ANSWER_DASH_BORDER}`,
	strokeDashoffset: ANSWER_DASH_BORDER,
	vectorEffect: "non-scaling-stroke",
	pointerEvents: "none",
} as const;
// Caps the "?" on large masks, as a fraction of the image's shorter side.
const MAX_QUESTION_MARK_SIZE = 0.08;

interface OcclusionMasksProps {
	occlusion: ImageOcclusionResponseDto;
	targetKey: string;
	revealed: boolean;
}

type MaskState = "hidden" | "target" | "revealed" | "covered";

/** Which masks cover the image, per mode and phase. */
function maskStateFor(
	mask: MaskShape,
	targetKey: string,
	mode: ImageOcclusionResponseDto["mode"],
	revealed: boolean,
): MaskState {
	if (targetKeyOf(mask) === targetKey)
		return revealed ? "revealed" : "target";
	return mode === "hideAllGuessOne" ? "covered" : "hidden";
}

/** The masks drawn over an occlusion card's image, sized to whatever box it's placed in. */
export default function OcclusionMasks({
	occlusion,
	targetKey,
	revealed,
}: OcclusionMasksProps) {
	const { imageWidth: w, imageHeight: h, shapes, mode } = occlusion;
	// Masks the user clicked away to peek underneath, once the answer is shown.
	const [peeked, setPeeked] = useState<Set<string>>(new Set());

	const togglePeek = (id: string) =>
		setPeeked(current => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<svg
			viewBox={`0 0 ${w} ${h}`}
			preserveAspectRatio="none"
			style={{
				position: "absolute",
				inset: 0,
				width: "100%",
				height: "100%",
				pointerEvents: "none",
				// In screen pixels, so masks lift off the image the same at any size.
				filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))",
			}}>
			{shapes.map(shape => {
				if (!isMask(shape))
					return (
						<OcclusionText
							key={shape.id}
							shape={shape}
							w={w}
							h={h}
						/>
					);
				const state = maskStateFor(shape, targetKey, mode, revealed);
				if (state === "hidden") return null;
				return (
					<OcclusionMask
						key={shape.id}
						shape={shape}
						state={state}
						peeked={peeked.has(shape.id)}
						w={w}
						h={h}
						onClick={
							revealed && state === "covered"
								? () => togglePeek(shape.id)
								: undefined
						}
					/>
				);
			})}
		</svg>
	);
}

function OcclusionMask({
	shape,
	state,
	peeked,
	w,
	h,
	onClick,
}: {
	shape: MaskShape;
	state: Exclude<MaskState, "hidden">;
	peeked: boolean;
	w: number;
	h: number;
	onClick?: () => void;
}) {
	const width = shape.width * w;
	const height = shape.height * h;
	const edge = `color-mix(in srgb, ${shape.fill} 65%, black)`;
	const style = {
		...maskStyle(state, peeked, shape.fill, edge),
		vectorEffect: "non-scaling-stroke" as const,
		pointerEvents: onClick ? ("all" as const) : ("none" as const),
		cursor: onClick ? "pointer" : undefined,
	};
	const questionMarkSize = Math.min(
		Math.min(width, height) * 0.55,
		Math.min(w, h) * MAX_QUESTION_MARK_SIZE,
	);

	return (
		<g
			data-testid={`occlusion-mask-${state}`}
			transform={maskTransform(shape, w, h)}
			onClick={onClick}>
			{state === "revealed" && (
				<MaskOutline
					shape={shape}
					width={width}
					height={height}
					style={ANSWER_BORDER_STYLE}
				/>
			)}
			<MaskOutline
				shape={shape}
				width={width}
				height={height}
				style={style}
			/>
			{state === "target" && (
				<text
					x={width / 2}
					y={height / 2}
					textAnchor="middle"
					dominantBaseline="central"
					fontSize={questionMarkSize}
					fontWeight={700}
					fill="white">
					?
				</text>
			)}
		</g>
	);
}

function MaskOutline({
	shape,
	width,
	height,
	style,
}: {
	shape: MaskShape;
	width: number;
	height: number;
	style: CSSProperties;
}) {
	return shape.kind === "rect" ? (
		<rect
			width={width}
			height={height}
			rx={Math.min(width, height) * 0.12}
			style={style}
		/>
	) : (
		<ellipse
			cx={width / 2}
			cy={height / 2}
			rx={width / 2}
			ry={height / 2}
			style={style}
		/>
	);
}

/** Covered masks keep their color, the quizzed one stands out, and the answer is outlined in the same color. */
function maskStyle(
	state: Exclude<MaskState, "hidden">,
	peeked: boolean,
	fill: string,
	edge: string,
) {
	if (state === "target")
		return { fill: PRIMARY, stroke: "white", strokeWidth: 2 };
	if (state === "revealed")
		return {
			fill: "transparent",
			stroke: PRIMARY,
			strokeWidth: ANSWER_DASH.width,
			strokeDasharray: `${ANSWER_DASH.dash} ${ANSWER_DASH.gap}`,
		};
	if (peeked)
		return {
			fill: "transparent",
			stroke: edge,
			strokeWidth: 1.5,
			strokeDasharray: "6 4",
		};
	return { fill, stroke: edge, strokeWidth: 1 };
}
