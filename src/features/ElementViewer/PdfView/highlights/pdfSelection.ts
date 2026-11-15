import type { DocumentsCapability, PageRef } from "@embedpdf/react/runtime";
import type { SelectionCapability, TextRange } from "@embedpdf/react/selection";
import { ClozePageText } from "./pdfFloatingMenuContent";
import { PageRect } from "./pdfHighlightAnnotations";

// Past any page's last character; ranges are clamped to the page.
const PAGE_END = Number.MAX_SAFE_INTEGER;

/** One page of the selection: its 0-based index, the selected character range on it, and its selected lines. */
export interface SelectedPage {
	pageIndex: number;
	range: TextRange;
	/** The page's whole text, split around `range`. */
	before: TextRange;
	after: TextRange;
	lineRects: PageRect[];
}

function samePage(a: PageRef, b: PageRef) {
	return a.objectNumber === b.objectNumber;
}

function pageRange(page: PageRef, start: number, end: number): TextRange {
	return { start: { page, index: start }, end: { page, index: end } };
}

/** The pages the selection covers, in document order. */
export function listSelectedPages(
	selection: SelectionCapability,
	documents: DocumentsCapability,
): SelectedPage[] {
	const snapshot = selection.getSnapshot();
	const range = snapshot.range;
	if (!range) return [];
	return snapshot.pages
		.filter(({ segments }) => segments.length > 0)
		.map(({ page, segments }) => {
			const start = samePage(page, range.start.page)
				? range.start.index
				: 0;
			const end = samePage(page, range.end.page)
				? range.end.index
				: PAGE_END;
			return {
				pageIndex: documents.getPageIndex(page),
				range: pageRange(page, start, end),
				before: pageRange(page, 0, start),
				after: pageRange(page, end, PAGE_END),
				lineRects: segments.map(({ rect }) => rect),
			};
		});
}

/** Each selected line's box with its page, as highlights and overlap checks take them. */
export function selectedLineRects(
	pages: SelectedPage[],
): { pageIndex: number; rect: PageRect }[] {
	return pages.flatMap(({ pageIndex, lineRects }) =>
		lineRects.map(rect => ({ pageIndex, rect })),
	);
}

/** The selected text of each page. */
export function readSelectedTexts(
	selection: SelectionCapability,
	pages: SelectedPage[],
): Promise<string[]> {
	return Promise.all(
		pages.map(({ range }) => selection.readTextInRange(range)),
	);
}

/** Each page's text split around the selection, for a cloze front. */
export function readClozePageTexts(
	selection: SelectionCapability,
	pages: SelectedPage[],
): Promise<ClozePageText[]> {
	return Promise.all(
		pages.map(async ({ before, range, after }) => {
			const [beforeText, hidden, afterText] = await Promise.all([
				selection.readTextInRange(before),
				selection.readTextInRange(range),
				selection.readTextInRange(after),
			]);
			return { before: beforeText, hidden, after: afterText };
		}),
	);
}
