import { RootState } from "../store";

export const selectSearchOpened = (state: RootState) => state.search.opened;

export const selectSearchQuery = (state: RootState) => state.search.query;

export const selectSearchCaseSensitive = (state: RootState) =>
	state.search.caseSensitive;

export const selectSearchCurrentIndex = (state: RootState) =>
	state.search.currentIndex;

export const selectSearchTotalMatches = (state: RootState) =>
	state.search.totalMatches;

export const selectSearchPendingMatch = (state: RootState) =>
	state.search.pendingMatch;
