import {
	deleteElementPermanently,
	emptyTrash,
	getTrash,
	restoreElement,
	trashElement,
} from "../../api/trash/api/trashApi";
import { TrashedElementDto } from "../../api/trash/dto/trashedElementDto";
import { clearSplitHeights } from "../../features/ElementViewer/LearningAssetView/core/heights/splitHeightsStorage";
import { ElementId } from "../../types/elements/elementId";
import errorToString from "../../utils/errorToString";
import { fetchLatestTree } from "../elements/elementsActions";
import { removeTreeNode, setTree } from "../elements/elementsReducer";
import { AppDispatch, RootState } from "../store";
import { setTrash, setTrashError, setTrashLoading } from "./trashReducer";
import { resetStaleStudyScopeAction } from "../study/studyScopeActions";

export function loadTrash() {
	return async (dispatch: AppDispatch) => {
		dispatch(setTrashLoading());
		try {
			dispatch(setTrash(await getTrash()));
		} catch (error) {
			dispatch(setTrashError(errorToString(error)));
		}
	};
}

export function trashElementAction(elementId: ElementId) {
	return async (dispatch: AppDispatch) => {
		dispatch(setTrashLoading());
		try {
			await trashElement(elementId);
			dispatch(removeTreeNode(elementId.id));
			dispatch(resetStaleStudyScopeAction());
			dispatch(setTrash(await getTrash()));
		} catch (error) {
			dispatch(setTrashError(errorToString(error)));
		}
	};
}

export function restoreElementAction(elementId: ElementId) {
	return withTrashRefresh(() => restoreElement(elementId));
}

export function deleteElementPermanentlyAction(elementId: ElementId) {
	return withTrashRefresh(async () => {
		await deleteElementPermanently(elementId);
		forgetSplitHeights([elementId]);
	});
}

export function emptyTrashAction(items: TrashedElementDto[]) {
	return withTrashRefresh(async () => {
		await emptyTrash();
		forgetSplitHeights(items.map(item => item.elementId));
	});
}

/** A permanently deleted learning asset's cached split heights are dead weight in
 * localStorage, so they go with it. */
function forgetSplitHeights(elementIds: ElementId[]) {
	for (const elementId of elementIds) {
		if (elementId.type === "learningAsset") clearSplitHeights(elementId.id);
	}
}

/** Restoring and deleting can change what the element tree shows, so both are
 * reloaded together. */
function withTrashRefresh(operation: () => Promise<void>) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		dispatch(setTrashLoading());
		try {
			await operation();
			const [tree, trash] = await Promise.all([
				fetchLatestTree(getState),
				getTrash(),
			]);
			dispatch(setTree(tree));
			dispatch(setTrash(trash));
			dispatch(resetStaleStudyScopeAction());
		} catch (error) {
			dispatch(setTrashError(errorToString(error)));
		}
	};
}
