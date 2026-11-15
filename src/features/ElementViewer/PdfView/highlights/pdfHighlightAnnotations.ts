import { ElementNodeType } from "../../../../types/elements/elementNodeType";

// Stored with each highlight; the view itself draws ours in the editor's theme colors (`PdfHighlightLayer`).
export const EXTRACT_HIGHLIGHT_COLOR = "#FFCD45";
export const CLOZE_HIGHLIGHT_COLOR = "#4DABF7";

// The values embedpdf 2's annotation plugin wrote, kept so stored highlights stay readable by older builds.
const HIGHLIGHT_ANNOTATION_SUBTYPE = 9;
const MULTIPLY_BLEND_MODE = 1;

/** A box in PDF points from the page's top-left, y down, as v3's selection and search give it. */
export interface PageRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The same box in the shape stored highlights use (embedpdf 2's). */
export interface StoredRect {
	origin: { x: number; y: number };
	size: { width: number; height: number };
}

export function toStoredRect({ x, y, width, height }: PageRect): StoredRect {
	return { origin: { x, y }, size: { width, height } };
}

export function toPageRect({ origin, size }: StoredRect): PageRect {
	return { x: origin.x, y: origin.y, width: size.width, height: size.height };
}

/** Ties a highlight to the extract or card made from it, as the editor's `HighlightNode` does. */
export interface PdfHighlightCustomData {
	elementId: string;
	elementType: Extract<ElementNodeType, "extract" | "card">;
}

/** One page's highlight for one element; `pageIndex` is 0-based. */
export interface PdfHighlightAnnotation {
	id: string;
	type: typeof HIGHLIGHT_ANNOTATION_SUBTYPE;
	pageIndex: number;
	rect: StoredRect;
	segmentRects: StoredRect[];
	strokeColor: string;
	opacity: number;
	blendMode: typeof MULTIPLY_BLEND_MODE;
	flags: string[];
	custom: PdfHighlightCustomData;
}

/** How highlights are saved: embedpdf 2's annotation transfer format, which older builds still read. */
export interface StoredPdfHighlight {
	annotation: PdfHighlightAnnotation;
}

function unionRect(rects: PageRect[]): PageRect {
	const minX = Math.min(...rects.map(rect => rect.x));
	const minY = Math.min(...rects.map(rect => rect.y));
	const maxX = Math.max(...rects.map(rect => rect.x + rect.width));
	const maxY = Math.max(...rects.map(rect => rect.y + rect.height));
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** One highlight per page the selection spans, tied to its extract or card through `custom`. */
export function buildHighlightAnnotations(
	lineRects: { pageIndex: number; rect: PageRect }[],
	elementId: string,
	elementType: PdfHighlightCustomData["elementType"],
	color: string,
): PdfHighlightAnnotation[] {
	const rectsByPage = new Map<number, PageRect[]>();
	for (const { pageIndex, rect } of lineRects) {
		const rects = rectsByPage.get(pageIndex);
		if (rects) rects.push(rect);
		else rectsByPage.set(pageIndex, [rect]);
	}

	return Array.from(rectsByPage, ([pageIndex, segmentRects]) => ({
		id: crypto.randomUUID(),
		type: HIGHLIGHT_ANNOTATION_SUBTYPE,
		pageIndex,
		rect: toStoredRect(unionRect(segmentRects)),
		segmentRects: segmentRects.map(toStoredRect),
		strokeColor: color,
		opacity: 1,
		blendMode: MULTIPLY_BLEND_MODE,
		flags: ["print", "readOnly"],
		custom: { elementId, elementType },
	}));
}

function rectsIntersect(a: PageRect, b: PageRect): boolean {
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
}

function overlapsSelection(
	highlight: PdfHighlightAnnotation,
	selectionRects: { pageIndex: number; rect: PageRect }[],
): boolean {
	return selectionRects.some(
		({ pageIndex, rect }) =>
			highlight.pageIndex === pageIndex &&
			highlight.segmentRects.some(segment =>
				rectsIntersect(toPageRect(segment), rect),
			),
	);
}

/** Whether a stored item is one of our highlights; anything else in the saved JSON is ignored. */
export function isPdfHighlightAnnotation(
	annotation: unknown,
): annotation is PdfHighlightAnnotation {
	const candidate = annotation as Partial<PdfHighlightAnnotation> | null;
	return (
		candidate?.type === HIGHLIGHT_ANNOTATION_SUBTYPE &&
		typeof candidate.custom?.elementId === "string" &&
		typeof candidate.pageIndex === "number" &&
		Array.isArray(candidate.segmentRects)
	);
}

/** Reads the saved highlights JSON, keeping only well-formed highlights. */
export function parseStoredHighlights(json: string): PdfHighlightAnnotation[] {
	const items = JSON.parse(json) as unknown;
	if (!Array.isArray(items)) return [];
	return items
		.map(item => (item as Partial<StoredPdfHighlight> | null)?.annotation)
		.filter(isPdfHighlightAnnotation);
}

export function serializeHighlights(
	highlights: PdfHighlightAnnotation[],
): string {
	return JSON.stringify(
		highlights.map((annotation): StoredPdfHighlight => ({ annotation })),
	);
}

/** The element behind the topmost-then-leftmost highlight under the selection,
 * so "Open" picks the same one whichever way the selection was dragged. */
export function findFirstHighlightedElement(
	highlights: PdfHighlightAnnotation[],
	selectionRects: { pageIndex: number; rect: PageRect }[],
): PdfHighlightCustomData | null {
	const first = highlights
		.filter(highlight => overlapsSelection(highlight, selectionRects))
		.sort((a, b) => {
			if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
			if (a.rect.origin.y !== b.rect.origin.y)
				return a.rect.origin.y - b.rect.origin.y;
			return a.rect.origin.x - b.rect.origin.x;
		})[0];
	return first?.custom ?? null;
}

/** The ids of the highlights overlapping the selection. */
export function findHighlightsUnderSelection(
	highlights: PdfHighlightAnnotation[],
	selectionRects: { pageIndex: number; rect: PageRect }[],
): string[] {
	return highlights
		.filter(highlight => overlapsSelection(highlight, selectionRects))
		.map(({ id }) => id);
}
