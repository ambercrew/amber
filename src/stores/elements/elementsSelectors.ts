import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";
import { existsInTree } from "./elementsActions";

export const selectElementTree = (state: RootState) => state.elements.tree;
export const selectElementTreeIsLoading = (state: RootState) =>
	state.elements.isLoading;
export const selectElementTreeError = (state: RootState) =>
	state.elements.error;
export const selectCurrentElement = (state: RootState) =>
	state.elements.currentElement;

/**
 * A view with its own zoom (e.g. the PDF viewer) registers through `setZoomOwnedByCurrentView`, so the
 * app-wide zoom shortcuts and wheel gesture leave it alone.
 */
export const selectCanZoomAppWide = (state: RootState) =>
	!state.elements.zoomOwnedByCurrentView;

/**
 * Trashing removes an element and its subtree from the tree but keeps its row, so
 * loaded but missing from the tree means trashed.
 */
export const selectCurrentElementIsTrashed = createSelector(
	[
		selectElementTree,
		(state: RootState) =>
			state.elements.currentElement?.data.meta.elementId,
	],
	(tree, elementId) => !!elementId && !existsInTree(tree, elementId),
);
