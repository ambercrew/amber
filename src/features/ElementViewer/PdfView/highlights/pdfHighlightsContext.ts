import { createContext, use } from "react";
import { PdfHighlightAnnotation } from "./pdfHighlightAnnotations";

export interface PdfHighlightsValue {
	/** Every highlight of the learning asset, saved or not yet. */
	highlights: PdfHighlightAnnotation[];
	/** The same highlights by 0-based page index, so each page finds its own without scanning them all. */
	highlightsByPage: ReadonlyMap<number, PdfHighlightAnnotation[]>;
	addHighlights: (highlights: PdfHighlightAnnotation[]) => void;
	removeHighlights: (ids: string[]) => void;
}

export function groupHighlightsByPage(
	highlights: PdfHighlightAnnotation[],
): Map<number, PdfHighlightAnnotation[]> {
	const byPage = new Map<number, PdfHighlightAnnotation[]>();
	for (const highlight of highlights) {
		const page = byPage.get(highlight.pageIndex);
		if (page) page.push(highlight);
		else byPage.set(highlight.pageIndex, [highlight]);
	}
	return byPage;
}

export const PdfHighlightsContext = createContext<PdfHighlightsValue | null>(
	null,
);

/** The PDF's extract and cloze highlights, which the view draws itself rather than writing them into the PDF. */
export function usePdfHighlights(): PdfHighlightsValue {
	const value = use(PdfHighlightsContext);
	if (!value)
		throw new Error(
			"usePdfHighlights must be used inside PdfHighlightsProvider",
		);
	return value;
}
