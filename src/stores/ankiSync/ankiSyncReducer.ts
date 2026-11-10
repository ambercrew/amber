import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AnkiSyncPreviewDto } from "../../api/ankiSync/dto/ankiSyncPreviewDto";

/** The review shown before a sync: open while its preview loads, then the preview or why it failed. */
export type AnkiSyncReview =
	| { status: "loading" }
	| {
			status: "ready";
			preview: AnkiSyncPreviewDto;
			/** The account syncs, but Amber couldn't sync before this preview. */
			missedCloudSync: boolean;
	  }
	| { status: "failed"; error: string };

interface AnkiSyncState {
	/** A sync is running. */
	isBusy: boolean;
	/** The sync waiting for the user's review, or null when no review is open. */
	review: AnkiSyncReview | null;
}

const initialState: AnkiSyncState = { isBusy: false, review: null };

const ankiSyncSlice = createSlice({
	name: "ankiSync",
	initialState,
	reducers: {
		setIsAnkiSyncBusy(state, action: PayloadAction<boolean>) {
			state.isBusy = action.payload;
		},
		setAnkiSyncReview(state, action: PayloadAction<AnkiSyncReview | null>) {
			state.review = action.payload;
		},
	},
});

export const { setIsAnkiSyncBusy, setAnkiSyncReview } = ankiSyncSlice.actions;
export default ankiSyncSlice.reducer;
