import { TextShape } from "../../../api/imageOcclusion/dto/occlusionShape";
import {
	LABEL_FONT_FAMILY,
	LABEL_LINE_HEIGHT,
} from "../utils/occlusionLabelFont";

/** A text label drawn over an occlusion's image, in its SVG's image units. */
export default function OcclusionText({
	shape,
	w,
	h,
}: {
	shape: TextShape;
	w: number;
	h: number;
}) {
	const x = shape.x * w;
	const y = shape.y * h;
	const fontSize = shape.fontSize * h;
	// SVG text never breaks on "\n", so each line gets its own tspan.
	return (
		<text
			x={x}
			y={y}
			transform={`rotate(${shape.rotation} ${x} ${y})`}
			dominantBaseline="hanging"
			fontSize={fontSize}
			fontFamily={LABEL_FONT_FAMILY}
			fontWeight={700}
			fill={shape.color}
			style={{ whiteSpace: "pre" }}>
			{shape.text.split("\n").map((line, index) => (
				<tspan
					key={index}
					x={x}
					dy={index === 0 ? 0 : fontSize * LABEL_LINE_HEIGHT}>
					{line}
				</tspan>
			))}
		</text>
	);
}
