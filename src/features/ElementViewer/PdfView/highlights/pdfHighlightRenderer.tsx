import { MantineColor } from "@mantine/core";
import {
	PdfAnnotationSubtype,
	PdfBlendMode,
	PdfHighlightAnnoObject,
} from "@embedpdf/models";
import { createRenderer } from "@embedpdf/plugin-annotation/react";
import { CLOZE_COLOR, EXTRACT_COLOR } from "../../highlightColors";
import {
	isPdfHighlightAnnotation,
	PdfHighlightCustomData,
} from "./pdfHighlightAnnotations";

const ELEMENT_HIGHLIGHT_COLORS: Record<
	PdfHighlightCustomData["elementType"],
	MantineColor
> = { extract: EXTRACT_COLOR, card: CLOZE_COLOR };

/** The editor's highlight tint over white paper; multiplied, so the text underneath stays black. */
function editorHighlightColor(color: MantineColor) {
	return `color-mix(in srgb, var(--mantine-color-${color}-4) 45%, white)`;
}

/** Replaces embedpdf's highlight renderer (same `id`), drawing our extracts and clozes in the editor's theme colors. */
export const pdfHighlightRenderer = createRenderer<PdfHighlightAnnoObject>({
	id: "highlight",
	matches: (a): a is PdfHighlightAnnoObject =>
		a.type === PdfAnnotationSubtype.HIGHLIGHT,
	useAppearanceStream: false,
	defaultBlendMode: PdfBlendMode.Multiply,
	zIndex: 0,
	interactionDefaults: {
		isDraggable: false,
		isResizable: false,
		isRotatable: false,
	},
	render: ({ currentObject, scale, onClick }) => {
		const { rect, segmentRects, strokeColor, opacity } = currentObject;
		// The PDF's own highlights keep their stored color.
		const background = isPdfHighlightAnnotation(currentObject)
			? editorHighlightColor(
					ELEMENT_HIGHLIGHT_COLORS[currentObject.custom.elementType],
				)
			: (strokeColor ?? "#FFFF00");
		return (
			<>
				{segmentRects.map((segment, index) => (
					<div
						key={index}
						onPointerDown={onClick}
						style={{
							position: "absolute",
							left: (segment.origin.x - rect.origin.x) * scale,
							top: (segment.origin.y - rect.origin.y) * scale,
							width: segment.size.width * scale,
							height: segment.size.height * scale,
							background,
							opacity: isPdfHighlightAnnotation(currentObject)
								? 1
								: (opacity ?? 0.5),
							pointerEvents: onClick ? "auto" : "none",
							cursor: onClick ? "pointer" : "default",
						}}
					/>
				))}
			</>
		);
	},
});
