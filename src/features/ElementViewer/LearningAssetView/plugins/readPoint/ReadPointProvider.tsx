import { PropsWithChildren, useCallback, useMemo, useState } from "react";
import { isNoReadPoint } from "../../../readPoint/readingPosition";
import { useGoToReadPointCommand } from "../../../readPoint/useGoToReadPointCommand";
import { ReadingPosition } from "../../../../../types/elements/readingPosition";
import { landOnBlock } from "../../core/landOnBlock";
import { useReaderCore } from "../../core/readerCoreContext";
import { ReadPointContext } from "../../../readPoint/readPointContext";
import { useReadPoint } from "./useReadPoint";

/** Saves the read point as the reader goes, and handles the set/clear/go-to read point commands. */
export default function ReadPointProvider({ children }: PropsWithChildren) {
	const {
		learningAssetId,
		initialReadPoint: initial,
		splits,
		primarySeq,
		getContentRoot,
		restoredRef,
		anchors,
		navigate,
	} = useReaderCore();
	const [displayed, setDisplayed] = useState(initial);

	const { recordExtractReadPoint } = useReadPoint({
		learningAssetId,
		primarySeq,
		initial,
		getContentRoot,
		lastSplitSeq: splits[splits.length - 1]?.seq,
		restoredRef,
		anchors,
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
