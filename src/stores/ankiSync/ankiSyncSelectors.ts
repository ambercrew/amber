import { RootState } from "../store";

export const selectIsAnkiSyncBusy = (state: RootState) => state.ankiSync.isBusy;

export const selectAnkiSyncReview = (state: RootState) => state.ankiSync.review;
