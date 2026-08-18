import { RootState } from "../store";

export const selectIsSyncing = (state: RootState) => state.sync.isSyncing;
export const selectElementRefreshCount = (state: RootState) =>
	state.sync.elementRefreshCount;
