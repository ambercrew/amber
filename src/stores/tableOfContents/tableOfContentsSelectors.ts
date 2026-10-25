import { RootState } from "../store";

export const selectTableOfContents = (state: RootState) =>
	state.tableOfContents.table;
export const selectActiveTableOfContentsEntryId = (state: RootState) =>
	state.tableOfContents.activeEntryId;
