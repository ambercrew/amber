import { Rect } from "@embedpdf/models";
import { GlyphPointer, SelectionRangeX } from "@embedpdf/plugin-selection";

/** Which edge of the menu sits on the anchor; `start` puts its left edge there. */
export type PdfMenuAlign = "start" | "center" | "end";

export interface PdfMenuAnchor {
	/** Where the anchor falls across the selection's box, from 0 (left) to 1 (right). */
	offset: number;
	align: PdfMenuAlign;
}

const CENTERED: PdfMenuAnchor = { offset: 0.5, align: "center" };

/**
 * Whether the selection was dragged from its end back to its start, or `null` when the drag's
 * starting glyph is unknown (e.g. a selection set in code).
 */
export function isBackwardPdfSelection(
	anchor: GlyphPointer | null,
	range: SelectionRangeX | null,
): boolean | null {
	if (!anchor || !range) return null;
	const isAt = (glyph: GlyphPointer) =>
		glyph.page === anchor.page && glyph.index === anchor.index;
	if (isAt(range.start)) return false;
	if (isAt(range.end)) return true;
	return null;
}

/**
 * Anchors the menu where the pointer let go: the start of the first selected line when
 * `atStart` (a backward drag), else the end of the last one.
 * Aligning by the anchor's side keeps the menu within the selection's width.
 * `lineRects` are one page's, in reading order; their union is the box embedpdf wraps the menu in.
 */
export function pdfMenuAnchor(
	lineRects: Rect[],
	atStart: boolean,
): PdfMenuAnchor {
	const edge = atStart ? lineRects[0] : lineRects[lineRects.length - 1];
	if (!edge) return CENTERED;

	const boxLeft = Math.min(...lineRects.map(rect => rect.origin.x));
	const boxRight = Math.max(
		...lineRects.map(rect => rect.origin.x + rect.size.width),
	);
	if (boxRight <= boxLeft) return CENTERED;

	const line = lineRects.filter(
		rect => Math.abs(rect.origin.y - edge.origin.y) < edge.size.height / 2,
	);
	const x = atStart
		? Math.min(...line.map(rect => rect.origin.x))
		: Math.max(...line.map(rect => rect.origin.x + rect.size.width));

	const offset = (x - boxLeft) / (boxRight - boxLeft);
	const align = offset < 1 / 3 ? "start" : offset > 2 / 3 ? "end" : "center";
	return { offset, align };
}
