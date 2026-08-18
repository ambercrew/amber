import { PayloadAction, createSlice } from "@reduxjs/toolkit";

interface SyncState {
	isSyncing: boolean;
	// Bumped once the currently open element's data has been reloaded after a
	// sync. Components key off this to remount fields that hold their own
	// uncontrolled input state (e.g. tags), so a remote change lands in them.
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
