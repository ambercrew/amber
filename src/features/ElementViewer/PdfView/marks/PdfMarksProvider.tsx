import { PropsWithChildren, useCallback, useMemo } from "react";
import { MarkSlot } from "../../../../types/elements/learningAssetMark";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { MARK_COLORS, pdfAnchorProgress } from "../../marks/markLogic";
import { MarksContext } from "../../marks/marksContext";
import { useMarks } from "../../marks/useMarks";
import { usePdfCore } from "../core/pdfCoreContext";

/** Loads the learning asset's marks and handles the set/go-to mark commands. */
export default function PdfMarksProvider({ children }: PropsWithChildren) {
	const {
		learningAssetId,
		pageCount,
		goToPage,
		getCurrentPage,
		getMenuPage,
	} = usePdfCore();

	const resolveSetAnchor = useCallback(
		(): ReadingPosition => ({
			split: getMenuPage() ?? getCurrentPage(),
			block: 0,
		}),
		[getMenuPage, getCurrentPage],
	);
	const goTo = useCallback(
		(anchor: ReadingPosition, slot: MarkSlot) =>
			goToPage(anchor.split, { flashColor: MARK_COLORS[slot] }),
		[goToPage],
	);
	const marks = useMarks({ learningAssetId, resolveSetAnchor, goTo });

	const progressOf = useCallback(
		(anchor: ReadingPosition) => pdfAnchorProgress(anchor, pageCount),
		[pageCount],
	);
	const value = useMemo(() => ({ marks, progressOf }), [marks, progressOf]);

	return <MarksContext value={value}>{children}</MarksContext>;
}
