import { useCallback, useState } from "react";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import { trashElementAction } from "../../../../stores/trash/trashActions";
import { ElementId } from "../../../../types/elements/elementId";
import { usePdfHighlights } from "./pdfHighlightsContext";

/** Highlights to delete along with the elements created from them, which go to the trash. */
export interface PdfHighlightRemoval {
	highlightIds: string[];
	/** Only the elements that still exist (not deleted or already trashed). */
	elementIds: ElementId[];
}

/** A highlight removal awaiting confirmation, as in the editor; held above the floating menu, which unmounts with the selection. */
export function usePdfHighlightRemoval() {
	const { removeHighlights } = usePdfHighlights();
	const dispatch = useAppDispatch();
	const [pendingRemoval, setPendingRemoval] =
		useState<PdfHighlightRemoval | null>(null);

	const confirmRemoval = useCallback(() => {
		if (!pendingRemoval) return;
		removeHighlights(pendingRemoval.highlightIds);
		for (const elementId of pendingRemoval.elementIds)
			void dispatch(trashElementAction(elementId));
	}, [pendingRemoval, removeHighlights, dispatch]);
	const cancelRemoval = useCallback(() => setPendingRemoval(null), []);

	return {
		pendingRemoval,
		requestRemoval: setPendingRemoval,
		confirmRemoval,
		cancelRemoval,
	};
}
