import { useCallback } from "react";
import { useChromeInsets } from "../../../../App/context/chromeInsetsContext";
import { ReadingPosition } from "../../../../../types/elements/readingPosition";
import MarkScrollbarTicks from "../../../marks/MarkScrollbarTicks";
import { useReaderCore } from "../../core/readerCoreContext";
import { landingScrollTop } from "./landingScrollTop";
import { useDisplayedReadPoint } from "../../../readPoint/readPointContext";

/** Ticks on the main scrollbar for each set mark and the read point. */
export default function MarksScrollbarOverlay() {
	const { scrollElement, splits, getContentRoot, getSplitBox } =
		useReaderCore();
	const readPoint = useDisplayedReadPoint();
	const insets = useChromeInsets();

	const landingScrollTopOf = useCallback(
		(anchor: ReadingPosition) =>
			scrollElement &&
			landingScrollTop(
				scrollElement,
				anchor,
				getSplitBox(anchor.split),
				getContentRoot(anchor.split),
				splits.find(split => split.seq === anchor.split)?.blockCount ??
					0,
			),
		[scrollElement, splits, getContentRoot, getSplitBox],
	);

	return (
		<MarkScrollbarTicks
			container={scrollElement?.parentElement ?? null}
			scrollElement={scrollElement}
			trackTop={insets.top}
			trackBottom={insets.bottom}
			trackTransition={insets.transition}
			readPoint={readPoint}
			landingScrollTopOf={landingScrollTopOf}
		/>
	);
}
