import { PropsWithChildren, useMemo } from "react";
import { ReadPointContext } from "../../readPoint/readPointContext";
import { usePdfCore } from "../core/pdfCoreContext";
import { usePdfReadPoint } from "./usePdfReadPoint";

/** Saves the read point as the reader goes, and handles the set/clear/go-to read point commands. */
export default function PdfReadPointProvider({ children }: PropsWithChildren) {
	const {
		learningAssetId,
		documentId,
		initialReadPoint,
		layoutReady,
		pageCount,
		goToPage,
		getCurrentPage,
		getMenuPage,
	} = usePdfCore();
	const { displayed, recordExtractReadPoint } = usePdfReadPoint({
		learningAssetId,
		documentId,
		initial: initialReadPoint,
		layoutReady,
		pageCount,
		goToPage,
		getCurrentPage,
		getMenuPage,
	});

	const value = useMemo(
		() => ({ displayed, recordExtractReadPoint }),
		[displayed, recordExtractReadPoint],
	);
	return <ReadPointContext value={value}>{children}</ReadPointContext>;
}
