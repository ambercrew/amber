import { RootState } from "../store";

export const selectIsSyncing = (state: RootState) => state.sync.isSyncing;
// Whether a sync runs or `withoutSync` holds them off, so a new one must wait.
export const selectIsSyncLocked = (state: RootState) =>
	state.sync.isSyncing || state.sync.isSyncHeld;
export const selectElementRefreshCount = (state: RootState) =>
	state.sync.elementRefreshCount;
export const selectIsFinishingBeforeClose = (state: RootState) =>
	state.sync.isFinishingBeforeClose;
