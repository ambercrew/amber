import {
	PdfAnnotationSubtype,
	PdfBlendMode,
	PdfHighlightAnnoObject,
	Rect,
} from "@embedpdf/models";

// Matches the annotation plugin's own default "highlight" tool color.
export const EXTRACT_HIGHLIGHT_COLOR = "#FFCD45";
export const CLOZE_HIGHLIGHT_COLOR = "#4DABF7";

/** `PdfAnnotationObjectBase.custom` is untyped (`any`) in the annotation
 * plugin — this is the shape we put there. */
export interface PdfHighlightCustomData {
	elementId: string;
}

// `Omit`s the base's `custom?: any` first — intersecting straight with `any`
// collapses the whole property back to `any`.
export type PdfHighlightAnnotation = Omit<PdfHighlightAnnoObject, "custom"> & {
	custom: PdfHighlightCustomData;
};

/** Flattens `SelectionScope.getHighlightRects()`'s per-page rect lists (the
 * actual per-line glyph rects) into the `{ page, rect }[]` shape
 * `buildHighlightAnnotations` expects. Deliberately not `getBoundingRects()`,
 * which collapses a whole page's selection into a single box spanning every
 * line — that's what previously made highlights render as one big rectangle
 * instead of following the selected text. */
export function flattenHighlightRects(
	rectsByPage: Record<number, Rect[]>,
): { page: number; rect: Rect }[] {
	return Object.entries(rectsByPage).flatMap(([page, rects]) =>
		rects.map(rect => ({ page: Number(page), rect })),
	);
}

function unionRect(rects: Rect[]): Rect {
	const minX = Math.min(...rects.map(rect => rect.origin.x));
	const minY = Math.min(...rects.map(rect => rect.origin.y));
	const maxX = Math.max(
		...rects.map(rect => rect.origin.x + rect.size.width),
	);
	const maxY = Math.max(
		...rects.map(rect => rect.origin.y + rect.size.height),
	);
	return {
		origin: { x: minX, y: minY },
		size: { width: maxX - minX, height: maxY - minY },
	};
}

/** Builds one `@embedpdf/plugin-annotation` highlight annotation per page a
 * selection spans, each carrying `elementId` (the newly created extract or
 * card's element id) in its `custom` field — the PDF equivalent of the
 * Lexical editor's `HighlightNode` tying a highlight mark back to its
 * element. */
export function buildHighlightAnnotations(
	boundingRects: { page: number; rect: Rect }[],
	elementId: string,
	color: string,
): PdfHighlightAnnotation[] {
	const rectsByPage = new Map<number, Rect[]>();
	for (const { page, rect } of boundingRects) {
		const rects = rectsByPage.get(page);
		if (rects) rects.push(rect);
		else rectsByPage.set(page, [rect]);
	}

	return Array.from(rectsByPage, ([pageIndex, segmentRects]) => ({
		id: crypto.randomUUID(),
		type: PdfAnnotationSubtype.HIGHLIGHT,
		pageIndex,
		rect: unionRect(segmentRects),
		segmentRects,
		strokeColor: color,
		opacity: 1,
		blendMode: PdfBlendMode.Multiply,
		flags: ["print", "readOnly"],
		custom: { elementId },
	}));
}
