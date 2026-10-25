import { useMemo } from "react";
import ReadingGutterPlugin from "../../../marks/ReadingGutterPlugin";
import { useMarksContext } from "../../../marks/marksContext";
import { useSplit } from "../../core/readerCoreContext";
import { useDisplayedReadPoint } from "../../../readPoint/readPointContext";

/** This split's mark flags and read point marker, side by side in its gutter. */
export default function MarksGutter() {
	const seq = useSplit();
	const { marks } = useMarksContext();
	const readPoint = useDisplayedReadPoint();

	const markBlocks = useMemo(
		() =>
			marks
				.filter(({ anchor }) => anchor.split === seq)
				.map(({ slot, anchor }) => ({ slot, block: anchor.block })),
		[marks, seq],
	);
	const readPointBlock =
		readPoint?.split === seq ? readPoint.block : undefined;

	if (readPointBlock === undefined && markBlocks.length === 0) return null;
	return (
		<ReadingGutterPlugin
			readPointBlock={readPointBlock}
			marks={markBlocks}
		/>
	);
}
