import { RootState } from "../store";
import { existsInTree } from "./elementsActions";

export const selectElementTree = (state: RootState) => state.elements.tree;
export const selectElementTreeIsLoading = (state: RootState) =>
	state.elements.isLoading;
export const selectElementTreeError = (state: RootState) =>
	state.elements.error;
export const selectCurrentElement = (state: RootState) =>
	state.elements.currentElement;

/** PDFs have their own independent zoom (see `PdfToolbar`) — the app-wide
 * zoom shortcuts and ctrl/cmd+wheel gesture must leave them alone instead
 * of scaling the whole app UI underneath the PDF's own zoom. */
export const selectCanZoomAppWide = (state: RootState) => {
	const currentElement = state.elements.currentElement;
	return !(
		currentElement?.type === "learningAsset" &&
		currentElement.data.type === "pdf"
	);
};

/** A live element always appears in the tree; trashing removes it (and its
 * whole subtree) from the tree query while leaving the row in place, so
 * "loaded but absent from the tree" is what being trashed looks like. */
export const selectCurrentElementIsTrashed = (state: RootState) => {
	const currentElement = state.elements.currentElement;
	if (!currentElement) return false;
	return !existsInTree(
		state.elements.tree,
		currentElement.data.meta.elementId,
	);
};
