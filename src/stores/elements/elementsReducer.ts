import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
	AnyElementDto,
	MetaResponseDto,
} from "../../api/elements/dto/anyElementDto";
import { NodeDto } from "../../api/elements/dto/nodeDto";
import { findTreeNode } from "../../utils/elementTree";
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
			const node = findTreeNode(state.tree, elementId.id);
			if (node) node.meta.name = name;
			const current = state.currentElement?.data.meta;
			if (current?.elementId.id === elementId.id) current.name = name;
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
} = elementsSlice.actions;
