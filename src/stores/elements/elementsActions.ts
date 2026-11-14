import {
	createCard,
	createExtract,
	createFolder,
	createLearningAsset,
	elementExists,
	getElementById,
	getElementMeta,
	getElementTree,
	moveElement,
	MoveElementDto,
	renameElement,
	setDerivedFrom,
} from "../../api/elements/api/elementsApi";
import { NodeDto } from "../../api/elements/dto/nodeDto";
import { ElementCreatedEventDto } from "../../api/elements/events/elementCreatedEvent";
import { CreateCardDto } from "../../types/elements/createCardDto";
import { CreateExtractDto } from "../../types/elements/createExtractDto";
import { CreateFolderDto } from "../../types/elements/createFolderDto";
import { CreateLearningAssetDto } from "../../types/elements/createLearningAssetDto";
import { ElementId } from "../../types/elements/elementId";
import { findTreeNode } from "../../utils/elementTree";
import errorToString from "../../utils/errorToString";
import { AppDispatch, RootState } from "../store";
import { loadElementDetailsAction } from "../elementDetails/elementDetailsActions";
import { resetStaleStudyScopeAction } from "../study/studyScopeActions";
import {
	addTreeNodes,
	moveTreeNode,
	setCurrentElement,
	setCurrentElementMeta,
	setElementName,
	setElementNameSource,
	setTree,
	setTreeError,
	setTreeLoading,
} from "./elementsReducer";

// Shared by every place that needs `elements.currentElement` to reflect a
// specific element right away (a route change, a study-session advance, a
// post-sync refresh) rather than a later effect catching up to it. Resolves
// to whether the element existed and was actually loaded.
/** `onShown` runs in the same tick as the element is set, so its dispatches render together with it. */
export function loadCurrentElementAction(
	elementId: ElementId,
	onShown?: () => void,
) {
	return async (dispatch: AppDispatch): Promise<boolean> => {
		const exists = await elementExists(elementId);
		if (!exists) return false;
		await Promise.all([
			getElementById(elementId).then(element => {
				dispatch(setCurrentElement(element));
				onShown?.();
			}),
			dispatch(loadElementDetailsAction(elementId)),
		]);
		return true;
	};
}

/** Refreshes the open element's meta and details (schedule, ...), leaving its content and editors alone. */
export function refreshCurrentElementMetaAction(elementId: ElementId) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		const meta = await getElementMeta(elementId);
		if (!meta) return;
		const current = getState().elements.currentElement?.data.meta;
		if (current?.elementId.id !== elementId.id) return;
		dispatch(setCurrentElementMeta(meta));
		await dispatch(loadElementDetailsAction(elementId));
	};
}

export function loadElementTree() {
	return withTreeRefresh(() => Promise.resolve());
}

export function setDerivedFromAction(
	elementId: ElementId,
	derivedFrom: ElementId | null,
) {
	return async (dispatch: AppDispatch) => {
		await setDerivedFrom(elementId, derivedFrom);
		dispatch(setCurrentElementMeta({ derivedFrom }));
	};
}

// Renaming makes the name manual on the backend, so the open element follows.
export function renameElementAction(elementId: ElementId, newName: string) {
	return (dispatch: AppDispatch) =>
		withErrorHandling(async () => {
			await renameElement(elementId, newName);
			dispatch(setElementName({ elementId, name: newName }));
			dispatch(setElementNameSource({ elementId, nameSource: "manual" }));
		})(dispatch);
}

/** Past this many, one reload beats finding each parent in the tree. */
const MAX_PATCHED_CREATIONS = 200;

/** Adds what the backend's `elementCreated` events announced to the tree. */
export function addCreatedElementsAction(created: ElementCreatedEventDto[]) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		const { tree } = getState().elements;
		const createdIds = new Set(created.map(c => c.element.elementId.id));
		const parentsKnown = created.every(
			({ parentId }) =>
				!parentId ||
				createdIds.has(parentId) ||
				findTreeNode(tree, parentId),
		);
		if (created.length > MAX_PATCHED_CREATIONS || !parentsKnown)
			await dispatch(loadElementTree());
		else dispatch(addTreeNodes(created));
	};
}

// The backend emits an `elementCreated` event for every one of these, which
// `useElementTreeState` adds to the tree from — no need to refetch it here too.
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
	return (dispatch: AppDispatch, getState: () => RootState) =>
		withErrorHandling(async () => {
			const { parent, position, rebalanced } = await moveElement(dto);
			const { tree } = getState().elements;
			const canPatch =
				!rebalanced &&
				findTreeNode(tree, dto.draggedId.id) &&
				(!parent || findTreeNode(tree, parent.id));
			if (canPatch)
				dispatch(
					moveTreeNode({
						elementId: dto.draggedId,
						parentId: parent?.id ?? null,
						position,
					}),
				);
			else await dispatch(loadElementTree());
		})(dispatch);
}

const MAX_TREE_FETCHES = 3;

/** Fetches again if the tree was patched meanwhile, as the answer may predate that change. */
export async function fetchLatestTree(getState: () => RootState) {
	for (let fetches = 1; ; fetches++) {
		const before = getState().elements.tree;
		const tree = await getElementTree();
		const patched = getState().elements.tree !== before;
		if (!patched || fetches === MAX_TREE_FETCHES) return tree;
	}
}

function withTreeRefresh(operation: () => Promise<void>) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		dispatch(setTreeLoading());
		try {
			await operation();
			dispatch(setTree(await fetchLatestTree(getState)));
			dispatch(resetStaleStudyScopeAction());
		} catch (error) {
			dispatch(setTreeError(errorToString(error)));
		}
	};
}

/** Resolves to whether the operation succeeded; failures are reported as a tree error. */
function withErrorHandling(operation: () => Promise<void>) {
	return async (dispatch: AppDispatch) => {
		try {
			await operation();
			return true;
		} catch (error) {
			dispatch(setTreeError(errorToString(error)));
			return false;
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
			existsInTree(folders, target) ||
			existsInTree(learningAssets, target) ||
			existsInTree(extracts, target) ||
			existsInTree(cards, target)
		)
			return true;
	}
	return false;
}
