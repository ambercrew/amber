import { MantineColor } from "@mantine/core";
import { usePage } from "@embedpdf/react/runtime";
import { CLOZE_COLOR, EXTRACT_COLOR } from "../../highlightColors";
import { PdfHighlightCustomData, toPageRect } from "./pdfHighlightAnnotations";
import { usePdfHighlights } from "./pdfHighlightsContext";

const ELEMENT_HIGHLIGHT_COLORS: Record<
	PdfHighlightCustomData["elementType"],
	MantineColor
> = { extract: EXTRACT_COLOR, card: CLOZE_COLOR };

/** The editor's highlight tint over white paper; multiplied, so the text underneath stays black. */
function editorHighlightColor(
	elementType: PdfHighlightCustomData["elementType"],
) {
	return `color-mix(in srgb, var(--mantine-color-${ELEMENT_HIGHLIGHT_COLORS[elementType]}-4) 45%, white)`;
}

/** Draws this page's extract and cloze highlights in the editor's colors; the pointer goes straight through to the text. */
export default function PdfHighlightLayer() {
	const page = usePage();
	const { highlightsByPage } = usePdfHighlights();
	const pageHighlights = highlightsByPage.get(page.pageIndex);
	if (!pageHighlights) return null;

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				pointerEvents: "none",
				mixBlendMode: "multiply",
			}}>
			{pageHighlights.flatMap(highlight =>
				highlight.segmentRects.map((segment, index) => {
					const rect = toPageRect(segment);
					const topLeft = page.transform.toPixels(rect);
					const bottomRight = page.transform.toPixels({
						x: rect.x + rect.width,
						y: rect.y + rect.height,
					});
					return (
						<div
							key={`${highlight.id}-${index}`}
							data-testid="pdf-highlight-segment"
							style={{
								position: "absolute",
								left: topLeft.x,
								top: topLeft.y,
								width: bottomRight.x - topLeft.x,
								height: bottomRight.y - topLeft.y,
								background: editorHighlightColor(
									highlight.custom.elementType,
								),
							}}
						/>
					);
				}),
			)}
		</div>
	);
}
