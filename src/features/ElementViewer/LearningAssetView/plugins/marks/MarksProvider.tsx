import { PropsWithChildren, useCallback, useMemo } from "react";
import { MarkSlot } from "../../../../../types/elements/learningAssetMark";
import { ReadingPosition } from "../../../../../types/elements/readingPosition";
import { flashElement } from "../../../marks/flashElement";
import { MARK_COLORS, textAnchorProgress } from "../../../marks/markLogic";
import { MarksContext } from "../../../marks/marksContext";
import { useMarks } from "../../../marks/useMarks";
import { landOnBlock } from "../../core/landOnBlock";
import { useReaderCore } from "../../core/readerCoreContext";

/** Loads the learning asset's marks and handles the set/go-to mark commands. */
export default function MarksProvider({ children }: PropsWithChildren) {
	const { learningAssetId, splits, getHeight, navigate, anchors } =
		useReaderCore();

	const goTo = useCallback(
		(anchor: ReadingPosition, slot: MarkSlot) =>
			navigate(
				anchor.split,
				landOnBlock(anchor.block, block =>
					flashElement(block, MARK_COLORS[slot]),
				),
			),
		[navigate],
	);
	const marks = useMarks({
		learningAssetId,
		resolveSetAnchor: anchors.resolveVisibleAnchor,
		goTo,
	});

	const progressOf = useCallback(
		(anchor: ReadingPosition) =>
			textAnchorProgress(anchor, splits, getHeight),
		[splits, getHeight],
	);
	const value = useMemo(() => ({ marks, progressOf }), [marks, progressOf]);

	return <MarksContext value={value}>{children}</MarksContext>;
}
