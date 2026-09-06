import {
	PdfAnnotationObject,
	PdfAnnotationSubtype,
	PdfBlendMode,
	PdfHighlightAnnoObject,
	Rect,
} from "@embedpdf/models";
import { ElementNodeType } from "../../../../types/elements/elementNodeType";

// Matches the annotation plugin's own default "highlight" tool color.
export const EXTRACT_HIGHLIGHT_COLOR = "#FFCD45";
export const CLOZE_HIGHLIGHT_COLOR = "#4DABF7";

/** `PdfAnnotationObjectBase.custom` is untyped (`any`) in the annotation
 * plugin — this is the shape we put there. */
export interface PdfHighlightCustomData {
	elementId: string;
	elementType: Extract<ElementNodeType, "extract" | "card">;
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
 * selection spans, each carrying `elementId`/`elementType` (the newly created
 * extract or card's element id/type) in its `custom` field — the PDF
 * equivalent of the Lexical editor's `HighlightNode` tying a highlight mark
 * back to its element. */
export function buildHighlightAnnotations(
	boundingRects: { page: number; rect: Rect }[],
	elementId: string,
	elementType: PdfHighlightCustomData["elementType"],
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
		// readOnly makes the annotation plugin treat it as non-interactive
		// (not selectable, no selection menu) — otherwise clicking it grabs
		// the annotation layer's focus/pointer handling and blocks text
		// selection on and around it.
		flags: ["print", "readOnly"],
		custom: { elementId, elementType },
	}));
}

function rectsIntersect(a: Rect, b: Rect): boolean {
	return (
		a.origin.x < b.origin.x + b.size.width &&
		a.origin.x + a.size.width > b.origin.x &&
		a.origin.y < b.origin.y + b.size.height &&
		a.origin.y + a.size.height > b.origin.y
	);
}

export function isPdfHighlightAnnotation(
	annotation: PdfAnnotationObject,
): annotation is PdfHighlightAnnotation {
	return (
		annotation.type === PdfAnnotationSubtype.HIGHLIGHT &&
		typeof (annotation as Partial<PdfHighlightAnnotation>).custom
			?.elementId === "string"
	);
}

/** Finds the element behind the topmost-then-leftmost highlight that overlaps
 * the current text selection, so the "Open" button jumps to a stable, visual
 * "first" highlight even when the selection spans multiple — regardless of
 * the direction the selection was dragged in. */
export function findFirstHighlightedElement(
	highlights: PdfHighlightAnnotation[],
	selectionRects: { page: number; rect: Rect }[],
): PdfHighlightCustomData | null {
	const matches = highlights.filter(highlight =>
		selectionRects.some(
			({ page, rect }) =>
				highlight.pageIndex === page &&
				highlight.segmentRects.some(segment =>
					rectsIntersect(segment, rect),
				),
		),
	);
	const first = matches.sort((a, b) => {
		if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
		if (a.rect.origin.y !== b.rect.origin.y) {
			return a.rect.origin.y - b.rect.origin.y;
		}
		return a.rect.origin.x - b.rect.origin.x;
	})[0];
	return first?.custom ?? null;
}

/** Finds every highlight annotation that actually overlaps the current text
 * selection, so "Remove Highlight" deletes just the highlight segment(s)
 * under the cursor — never the extract/card element it points to, and never
 * unrelated highlights elsewhere in the document that happen to share the
 * same element (e.g. another page of the same multi-page highlight). */
export function findHighlightsUnderSelection(
	highlights: PdfHighlightAnnotation[],
	selectionRects: { page: number; rect: Rect }[],
): { pageIndex: number; id: string }[] {
	const matches = new Map<string, { pageIndex: number; id: string }>();
	for (const { page, rect } of selectionRects) {
		for (const highlight of highlights) {
			if (
				highlight.pageIndex === page &&
				highlight.segmentRects.some(segment =>
					rectsIntersect(segment, rect),
				)
			) {
				matches.set(highlight.id, {
					pageIndex: highlight.pageIndex,
					id: highlight.id,
				});
			}
		}
	}
	return Array.from(matches.values());
}
