import { createSlice, original, PayloadAction } from "@reduxjs/toolkit";
import {
	AnyElementDto,
	MetaResponseDto,
} from "../../api/elements/dto/anyElementDto";
import { MetaNodeDto, NodeDto } from "../../api/elements/dto/nodeDto";
import {
	collectTreeIds,
	findTreePath,
	followTreePath,
	insertTreeNode,
	newTreeNode,
} from "../../utils/elementTree";
import { ElementId } from "../../types/elements/elementId";
import { NameSource } from "../../types/elements/nameSource";

export interface ElementsState {
	tree: NodeDto[];
	isLoading: boolean;
	error: string | null;
	currentElement: AnyElementDto | null;
	/** Set by a view (e.g. the PDF viewer) that owns its own independent
	 * zoom, so app-wide zoom shortcuts/gestures can leave it alone. */
	zoomOwnedByCurrentView: boolean;
}

const initialState: ElementsState = {
	tree: [],
	isLoading: false,
	error: null,
	currentElement: null,
	zoomOwnedByCurrentView: false,
};

/** Finds a node without walking the draft, which would proxy every node it passes. */
function findInDraft(state: ElementsState, id: string) {
	const path = findTreePath(original(state)?.tree ?? state.tree, id);
	return path && followTreePath(state.tree, path);
}

const elementsSlice = createSlice({
	name: "elements",
	initialState,
	reducers: {
		setTreeLoading: state => {
			state.isLoading = true;
			state.error = null;
		},
		setTree: (state, action: PayloadAction<NodeDto[]>) => {
			state.tree = action.payload;
			state.isLoading = false;
			state.error = null;
		},
		setTreeError: (state, action: PayloadAction<string>) => {
			state.error = action.payload;
			state.isLoading = false;
		},
		clearTreeError: state => {
			state.error = null;
		},
		setCurrentElement: (
			state,
			action: PayloadAction<AnyElementDto | null>,
		) => {
			state.currentElement = action.payload;
			state.zoomOwnedByCurrentView = false;
		},
		setZoomOwnedByCurrentView: (state, action: PayloadAction<boolean>) => {
			state.zoomOwnedByCurrentView = action.payload;
		},
		setElementName: (
			state,
			action: PayloadAction<{ elementId: ElementId; name: string }>,
		) => {
			const { elementId, name } = action.payload;
			const found = findInDraft(state, elementId.id);
			if (found) found.node.meta.name = name;
			const current = state.currentElement?.data.meta;
			if (current?.elementId.id === elementId.id) current.name = name;
		},
		/** In creation order, so an element may sit under one added before it.
		 * A reload may have brought some of them in already. */
		addTreeNodes: (
			state,
			action: PayloadAction<
				{ parentId: string | null; element: MetaNodeDto }[]
			>,
		) => {
			// Found before inserting, which shifts the indices of the paths found on the original tree.
			const parents = new Map<string, NodeDto>();
			for (const { parentId } of action.payload) {
				const found = parentId && findInDraft(state, parentId);
				if (found) parents.set(parentId, found.node);
			}
			const existing = collectTreeIds(
				original(state)?.tree ?? state.tree,
			);
			for (const { parentId, element } of action.payload) {
				const parent = parentId ? parents.get(parentId) : null;
				if (parent === undefined || existing.has(element.elementId.id))
					continue;
				existing.add(element.elementId.id);
				const node = newTreeNode(element);
				insertTreeNode(state.tree, parent, node);
				parents.set(element.elementId.id, node);
			}
		},
		moveTreeNode: (
			state,
			action: PayloadAction<{
				elementId: ElementId;
				parentId: string | null;
				position: string;
			}>,
		) => {
			const { elementId, parentId, position } = action.payload;
			const moved = findInDraft(state, elementId.id);
			const parent = parentId
				? (findInDraft(state, parentId)?.node ?? null)
				: null;
			if (!moved || (parentId && !parent)) return;
			moved.list.splice(moved.list.indexOf(moved.node), 1);
			moved.node.meta.position = position;
			insertTreeNode(state.tree, parent, moved.node);
		},
		removeTreeNode: (state, action: PayloadAction<string>) => {
			const found = findInDraft(state, action.payload);
			if (found) found.list.splice(found.list.indexOf(found.node), 1);
		},
		setElementNameSource: (
			state,
			action: PayloadAction<{
				elementId: ElementId;
				nameSource: NameSource;
			}>,
		) => {
			const { elementId, nameSource } = action.payload;
			const current = state.currentElement?.data.meta;
			if (current?.elementId.id === elementId.id)
				current.nameSource = nameSource;
		},
		setCurrentElementMeta: (
			state,
			action: PayloadAction<Partial<MetaResponseDto>>,
		) => {
			if (!state.currentElement) return;
			state.currentElement.data.meta = {
				...state.currentElement.data.meta,
				...action.payload,
			};
		},
	},
});

export default elementsSlice.reducer;

export const {
	setTreeLoading,
	setTree,
	setTreeError,
	clearTreeError,
	setCurrentElement,
	setCurrentElementMeta,
	setElementName,
	setElementNameSource,
	setZoomOwnedByCurrentView,
	addTreeNodes,
	moveTreeNode,
	removeTreeNode,
} = elementsSlice.actions;
