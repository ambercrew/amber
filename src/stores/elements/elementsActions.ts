import {
	clearDerivedFrom,
	createCard,
	createExtract,
	createFolder,
	createLearningAsset,
	elementExists,
	getElementById,
	getElementTree,
	moveElement,
	MoveElementDto,
	renameElement,
} from "../../api/elements/api/elementsApi";
import { NodeDto } from "../../api/elements/dto/nodeDto";
import { CreateCardDto } from "../../types/elements/createCardDto";
import { CreateExtractDto } from "../../types/elements/createExtractDto";
import { CreateFolderDto } from "../../types/elements/createFolderDto";
import { CreateLearningAssetDto } from "../../types/elements/createLearningAssetDto";
import { ElementId } from "../../types/elements/elementId";
import errorToString from "../../utils/errorToString";
import { AppDispatch } from "../store";
import { loadElementDetailsAction } from "../elementDetails/elementDetailsActions";
import {
	setCurrentElement,
	setCurrentElementMeta,
	setTree,
	setTreeError,
	setTreeLoading,
} from "./elementsReducer";

// Shared by every place that needs `elements.currentElement` to reflect a
// specific element right away (a route change, a study-session advance, a
// post-sync refresh) rather than a later effect catching up to it. Resolves
// to whether the element existed and was actually loaded.
export function loadCurrentElementAction(elementId: ElementId) {
	return async (dispatch: AppDispatch): Promise<boolean> => {
		const exists = await elementExists(elementId);
		if (!exists) return false;
		await Promise.all([
			getElementById(elementId).then(element =>
				dispatch(setCurrentElement(element)),
			),
			dispatch(loadElementDetailsAction(elementId)),
		]);
		return true;
	};
}

export function loadElementTree() {
	return withTreeRefresh(() => Promise.resolve());
}

export function clearDerivedFromAction(elementId: ElementId) {
	return async (dispatch: AppDispatch) => {
		await clearDerivedFrom(elementId);
		dispatch(setCurrentElementMeta({ derivedFrom: null }));
	};
}

export function renameElementAction(elementId: ElementId, newName: string) {
	return withTreeRefresh(() => renameElement(elementId, newName));
}

// The backend emits an `elementCreated` event for every one of these, which
// ElementTree listens for and reloads the tree from — no need to refetch it
// here too.
export function createFolderAction(dto: CreateFolderDto) {
	return withErrorHandling(() => createFolder(dto));
}

export function createLearningAssetAction(dto: CreateLearningAssetDto) {
	return withErrorHandling(() => createLearningAsset(dto));
}

export function createExtractAction(dto: CreateExtractDto) {
	return withErrorHandling(() => createExtract(dto));
}

export function createCardAction(dto: CreateCardDto) {
	return withErrorHandling(() => createCard(dto));
}

export function moveElementAction(dto: MoveElementDto) {
	return withTreeRefresh(() => moveElement(dto));
}

function withTreeRefresh(operation: () => Promise<void>) {
	return async (dispatch: AppDispatch) => {
		dispatch(setTreeLoading());
		try {
			await operation();
			const tree = await getElementTree();
			dispatch(setTree(tree));
		} catch (error) {
			dispatch(setTreeError(errorToString(error)));
		}
	};
}

function withErrorHandling(operation: () => Promise<void>) {
	return async (dispatch: AppDispatch) => {
		try {
			await operation();
		} catch (error) {
			dispatch(setTreeError(errorToString(error)));
		}
	};
}

export function existsInTree(
	nodes: NodeDto[],
	target: { type: string; id: string },
): boolean {
	for (const node of nodes) {
		if (
			node.meta.elementId.type === target.type &&
			node.meta.elementId.id === target.id
		)
			return true;
		const { folders, learningAssets, extracts, cards } = node.children;
		if (
			existsInTree(
				[...folders, ...learningAssets, ...extracts, ...cards],
				target,
			)
		)
			return true;
	}
	return false;
}
