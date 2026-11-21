import { PropsWithChildren, useCallback, useMemo } from "react";
import { ReadPointSource } from "../../../../types/elements/readPointSource";
import { ReadPointContext } from "../../readPoint/readPointContext";
import { usePdfCore } from "../core/pdfCoreContext";
import { usePdfReadPoint } from "./usePdfReadPoint";
import { useReviewResume } from "../../hooks/useReviewResume";
import { useOpeningReadPointSource } from "../../readPoint/useOpeningReadPointSource";

/** Saves the read point as the reader goes, and handles the set/clear/go-to read point commands. */
export default function PdfReadPointProvider({ children }: PropsWithChildren) {
	const {
		learningAssetId,
		documentId,
		initialReadPoint,
		initialViewPosition,
		layoutReady,
		pageCount,
		goToPage,
		getCurrentPage,
		getMenuPage,
	} = usePdfCore();
	const { resume, reportLeft, underReview } =
		useReviewResume(learningAssetId);
	const openingSource = useOpeningReadPointSource(
		resume?.readPointSource,
		underReview,
	);
	const handleLeave = useCallback(
		(source: ReadPointSource) => reportLeft({ readPointSource: source }),
		[reportLeft],
	);
	const { displayed, recordExtractReadPoint } = usePdfReadPoint({
		learningAssetId,
		documentId,
		initial: initialReadPoint,
		initialViewPosition,
		resumeSource: openingSource,
		onLeave: handleLeave,
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
