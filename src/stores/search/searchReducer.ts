import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ElementId } from "../../types/elements/elementId";

/** A match find in page should start on, once its element's matches are counted. */
export interface PendingSearchMatch {
	elementId: ElementId;
	index: number;
}

export interface SearchState {
	opened: boolean;
	query: string;
	caseSensitive: boolean;
	currentIndex: number;
	totalMatches: number;
	pendingMatch: PendingSearchMatch | null;
}

const initialState: SearchState = {
	opened: false,
	query: "",
	caseSensitive: false,
	currentIndex: -1,
	totalMatches: 0,
	pendingMatch: null,
};

const searchSlice = createSlice({
	name: "search",
	initialState,
	reducers: {
		openSearch: state => {
			state.opened = true;
		},
		closeSearch: state => {
			state.opened = false;
			state.query = "";
			state.currentIndex = -1;
			state.totalMatches = 0;
			state.pendingMatch = null;
		},
		/** Opens find in page on one match, e.g. a global search result. */
		openSearchAtMatch: (
			state,
			action: PayloadAction<
				PendingSearchMatch & { query: string; caseSensitive: boolean }
			>,
		) => {
			const { query, caseSensitive, elementId, index } = action.payload;
			state.opened = true;
			state.query = query;
			state.caseSensitive = caseSensitive;
			state.currentIndex = -1;
			state.totalMatches = 0;
			state.pendingMatch = { elementId, index };
		},
		clearPendingSearchMatch: state => {
			state.pendingMatch = null;
		},
		setSearchQuery: (state, action: PayloadAction<string>) => {
			state.query = action.payload;
		},
		setSearchCaseSensitive: (state, action: PayloadAction<boolean>) => {
			state.caseSensitive = action.payload;
		},
		setSearchMatchCounts: (
			state,
			action: PayloadAction<{
				currentIndex: number;
				totalMatches: number;
			}>,
		) => {
			state.currentIndex = action.payload.currentIndex;
			state.totalMatches = action.payload.totalMatches;
		},
		goToNextMatch: state => {
			state.currentIndex = state.totalMatches
				? (state.currentIndex + 1) % state.totalMatches
				: -1;
		},
		goToPreviousMatch: state => {
			state.currentIndex = state.totalMatches
				? (state.currentIndex - 1 + state.totalMatches) %
					state.totalMatches
				: -1;
		},
	},
});

export default searchSlice.reducer;

export const {
	openSearch,
	closeSearch,
	openSearchAtMatch,
	clearPendingSearchMatch,
	setSearchQuery,
	setSearchCaseSensitive,
	setSearchMatchCounts,
	goToNextMatch,
	goToPreviousMatch,
} = searchSlice.actions;
