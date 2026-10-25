import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { TableOfContentsEntry } from "../../types/elements/tableOfContentsEntry";

export interface PublishedTableOfContents {
	/** The element the table belongs to, e.g. to remember its expanded headings by. */
	ownerId: string;
	entries: TableOfContentsEntry[];
}

export interface TableOfContentsState {
	/** The open view's table; `null` when it has none. */
	table: PublishedTableOfContents | null;
	/** The entry the reader is in now. */
	activeEntryId: string | null;
}

const initialState: TableOfContentsState = {
	table: null,
	activeEntryId: null,
};

const tableOfContentsSlice = createSlice({
	name: "tableOfContents",
	initialState,
	reducers: {
		setTableOfContents: (
			state,
			action: PayloadAction<PublishedTableOfContents | null>,
		) => {
			state.table = action.payload;
			if (!action.payload) state.activeEntryId = null;
		},
		setActiveTableOfContentsEntry: (
			state,
			action: PayloadAction<string | null>,
		) => {
			state.activeEntryId = action.payload;
		},
	},
});

export default tableOfContentsSlice.reducer;

export const { setTableOfContents, setActiveTableOfContentsEntry } =
	tableOfContentsSlice.actions;
