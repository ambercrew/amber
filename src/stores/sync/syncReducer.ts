import { PayloadAction, createSlice } from "@reduxjs/toolkit";

interface SyncState {
	isSyncing: boolean;
	// Bumped once the open element has reloaded after a sync, so fields holding their own
	// uncontrolled input (e.g. tags) remount with the remote change.
	elementRefreshCount: number;
}

const initialState: SyncState = {
	isSyncing: false,
	elementRefreshCount: 0,
};

const syncSlice = createSlice({
	name: "sync",
	initialState,
	reducers: {
		setIsSyncing: (state, payload: PayloadAction<boolean>) => {
			state.isSyncing = payload.payload;
		},
		bumpElementRefreshCount: state => {
			state.elementRefreshCount += 1;
		},
	},
});

export default syncSlice.reducer;

export const { setIsSyncing, bumpElementRefreshCount } = syncSlice.actions;
