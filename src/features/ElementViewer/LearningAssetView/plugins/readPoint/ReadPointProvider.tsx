import { PropsWithChildren, useCallback, useMemo, useState } from "react";
import { ReadPointSource } from "../../../../../types/elements/readPointSource";
import { isNoReadPoint } from "../../../readPoint/readingPosition";
import { useGoToReadPointCommand } from "../../../readPoint/useGoToReadPointCommand";
import { ReadingPosition } from "../../../../../types/elements/readingPosition";
import { landOnBlock } from "../../core/landOnBlock";
import { useReaderCore } from "../../core/readerCoreContext";
import { ReadPointContext } from "../../../readPoint/readPointContext";
import { useReadPoint } from "./useReadPoint";
import { useReviewResume } from "../../../hooks/useReviewResume";
import { useOpeningReadPointSource } from "../../../readPoint/useOpeningReadPointSource";

/** Saves the read point as the reader goes, and handles the set/clear/go-to read point commands. */
export default function ReadPointProvider({ children }: PropsWithChildren) {
	const {
		learningAssetId,
		initialReadPoint: initial,
		splits,
		getContentRoot,
		restoredRef,
		anchors,
		navigate,
		onViewportChange,
	} = useReaderCore();
	const [displayed, setDisplayed] = useState(initial);
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

	const { recordExtractReadPoint } = useReadPoint({
		learningAssetId,
		initial,
		resumeSource: openingSource,
		onLeave: handleLeave,
		getContentRoot,
		lastSplitSeq: splits[splits.length - 1]?.seq,
		restoredRef,
		anchors,
		onViewportChange,
		onReadPointChange: setDisplayed,
	});

	const shown = isNoReadPoint(displayed) ? null : displayed;
	const goTo = useCallback(
		(readPoint: ReadingPosition) =>
			navigate(readPoint.split, landOnBlock(readPoint.block)),
		[navigate],
	);
	useGoToReadPointCommand(shown, goTo);

	const value = useMemo(
		() => ({ displayed: shown, recordExtractReadPoint }),
		[shown, recordExtractReadPoint],
	);
	return <ReadPointContext value={value}>{children}</ReadPointContext>;
}
