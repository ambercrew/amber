import { createContext, use } from "react";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { GoToPage } from "./usePdfNavigator";

export interface PdfCoreValue {
	learningAssetId: string;
	documentId: string;
	/** Read point to restore to on open; `split` is the 1-based page. */
	initialReadPoint: ReadingPosition;
	pageCount: number;
	/** Set once the first layout is ready and the saved zoom applied, so a restoring jump lands at the right scale. */
	layoutReady: boolean;
	goToPage: GoToPage;
	/** The 1-based page in view. */
	getCurrentPage: () => number;
	/** The 1-based page right-clicked to open the context menu, or `null` while it's closed. */
	getMenuPage: () => number | null;
	setMenuPage: (pageNumber: number | null) => void;
}

export const PdfCoreContext = createContext<PdfCoreValue | null>(null);

/** What every part of the PDF view shares: the document, its jumps and the page the reader is on. */
export function usePdfCore(): PdfCoreValue {
	const value = use(PdfCoreContext);
	if (!value)
		throw new Error("usePdfCore must be used inside PdfCoreProvider");
	return value;
}

/** What a jump leaves behind for the header; apart from `PdfCoreContext`, so each jump only re-renders its readers. */
export interface PdfArrivalValue {
	hideRequests: number;
}

export const PdfArrivalContext = createContext<PdfArrivalValue | null>(null);

export function usePdfArrival(): PdfArrivalValue {
	const value = use(PdfArrivalContext);
	if (!value)
		throw new Error("usePdfArrival must be used inside PdfCoreProvider");
	return value;
}
