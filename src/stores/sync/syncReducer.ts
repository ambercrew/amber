import { PayloadAction, createSlice } from "@reduxjs/toolkit";

interface SyncState {
	isSyncing: boolean;
	// Set while `withoutSync`'s operation runs: no sync may start, but none is running either.
	isSyncHeld: boolean;
	// Set while closing (or suspending) waits on a sync, the only time one blocks the UI.
	isFinishingBeforeClose: boolean;
	// Bumped once the open element has reloaded after a sync, so fields holding their own
	// uncontrolled input (e.g. tags) remount with the remote change.
	elementRefreshCount: number;
}

const initialState: SyncState = {
	isSyncing: false,
	isSyncHeld: false,
	isFinishingBeforeClose: false,
	elementRefreshCount: 0,
};

const syncSlice = createSlice({
	name: "sync",
	initialState,
	reducers: {
		setIsSyncing: (state, payload: PayloadAction<boolean>) => {
			state.isSyncing = payload.payload;
		},
		// Carries whether the sync succeeded, for the requests that waited on it.
		syncEnded: (state, _action: PayloadAction<boolean>) => {
			state.isSyncing = false;
		},
		setIsSyncHeld: (state, payload: PayloadAction<boolean>) => {
			state.isSyncHeld = payload.payload;
		},
		setIsFinishingBeforeClose: (state, payload: PayloadAction<boolean>) => {
			state.isFinishingBeforeClose = payload.payload;
		},
		// The user closes anyway; the sync left off at a commit, which the next one continues from.
		closeWithoutWaitingRequested: state => {
			state.isFinishingBeforeClose = false;
		},
		// The user stays in the app; the sync goes on in the background.
		keepWorkingRequested: state => {
			state.isFinishingBeforeClose = false;
		},
		bumpElementRefreshCount: state => {
			state.elementRefreshCount += 1;
		},
	},
});

export default syncSlice.reducer;

export const {
	setIsSyncing,
	syncEnded,
	setIsSyncHeld,
	setIsFinishingBeforeClose,
	closeWithoutWaitingRequested,
	keepWorkingRequested,
	bumpElementRefreshCount,
} = syncSlice.actions;
