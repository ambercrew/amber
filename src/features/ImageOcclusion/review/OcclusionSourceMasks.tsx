import { Box, isLightColor } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { ImageOcclusionResponseDto } from "../../../api/imageOcclusion/dto/imageOcclusionResponseDto";
import { MaskShape } from "../../../api/imageOcclusion/dto/occlusionShape";
import {
	isMask,
	maskTransform,
	targetKeyOf,
	targetKeys,
} from "../utils/occlusionTargets";
import OcclusionText from "./OcclusionText";

// The editor's mask look, in screen pixels so it matches at any image size.
const MASK_EDGE = "#2d2d2d";
const MASK_CORNER_RADIUS = 4;
const GROUP_DASH = "6 4";
const CARD_NUMBER_SIZE = 14;

/** Every mask numbered by its card, as the mask editor draws them, over the image they were made from. */
export default function OcclusionSourceMasks({
	occlusion,
}: {
	occlusion: ImageOcclusionResponseDto;
}) {
	const { imageWidth: w, imageHeight: h, shapes } = occlusion;
	const { ref, width } = useElementSize<HTMLSpanElement>();
	// Image units per screen pixel; the image keeps its aspect ratio, so one factor covers both axes.
	const unit = width > 0 ? w / width : 1;
	const keys = targetKeys(shapes);

	return (
		<Box
			ref={ref}
			component="span"
			pos="absolute"
			inset={0}
			style={{ pointerEvents: "none" }}>
			<svg
				viewBox={`0 0 ${w} ${h}`}
				preserveAspectRatio="none"
				style={{ display: "block", width: "100%", height: "100%" }}>
				{shapes.map(shape =>
					isMask(shape) ? (
						<SourceMask
							key={shape.id}
							shape={shape}
							cardNumber={keys.indexOf(targetKeyOf(shape)) + 1}
							w={w}
							h={h}
							unit={unit}
						/>
					) : (
						<OcclusionText
							key={shape.id}
							shape={shape}
							w={w}
							h={h}
						/>
					),
				)}
			</svg>
		</Box>
	);
}

function SourceMask({
	shape,
	cardNumber,
	w,
	h,
	unit,
}: {
	shape: MaskShape;
	cardNumber: number;
	w: number;
	h: number;
	unit: number;
}) {
	const width = shape.width * w;
	const height = shape.height * h;
	const style = {
		fill: shape.fill,
		stroke: MASK_EDGE,
		strokeWidth: 1,
		strokeDasharray: shape.groupId ? GROUP_DASH : undefined,
		vectorEffect: "non-scaling-stroke" as const,
	};

	return (
		<g
			data-testid="occlusion-source-mask"
			transform={maskTransform(shape, w, h)}>
			{shape.kind === "rect" ? (
				<rect
					width={width}
					height={height}
					rx={MASK_CORNER_RADIUS * unit}
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
			)}
			<text
				x={width / 2}
				y={height / 2}
				textAnchor="middle"
				dominantBaseline="central"
				fontSize={CARD_NUMBER_SIZE * unit}
				// Konva's default font, which the editor's numbers use.
				fontFamily="Arial"
				fontWeight={700}
				// Contrasts with the mask, so a dark swatch's number stays readable.
				fill={isLightColor(shape.fill) ? MASK_EDGE : "#ffffff"}>
				{cardNumber}
			</text>
		</g>
	);
}
