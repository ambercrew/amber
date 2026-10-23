import { createContext, use } from "react";
import { LearningAssetMark } from "../../../types/elements/learningAssetMark";
import { ReadingPosition } from "../../../types/elements/readingPosition";

interface MarksContextValue {
	marks: LearningAssetMark[];
	/** How far through the learning asset `anchor` sits, from 0 to 1, or `null` if unknown. */
	progressOf: (anchor: ReadingPosition) => number | null;
}

/** Shares the open learning asset's marks with controls rendered deep inside its editors (context menu, gutter flags). */
export const MarksContext = createContext<MarksContextValue>({
	marks: [],
	progressOf: () => null,
});

export function useMarksContext() {
	return use(MarksContext);
}
