import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ImageOcclusionLookupDto } from "../../api/imageOcclusion/dto/imageOcclusionLookupDto";

interface ImageOcclusionState {
	/** Sibling cards share one occlusion, so reviewing them back to back shows it at once. */
	lookups: Record<string, ImageOcclusionLookupDto>;
	/** Bumped when an occlusion changes, so everywhere it's shown refetches it. */
	versions: Record<string, number>;
}

const initialState: ImageOcclusionState = { lookups: {}, versions: {} };

const imageOcclusionSlice = createSlice({
	name: "imageOcclusion",
	initialState,
	reducers: {
		imageOcclusionLoaded: (
			state,
			action: PayloadAction<{
				id: string;
				lookup: ImageOcclusionLookupDto;
			}>,
		) => {
			state.lookups[action.payload.id] = action.payload.lookup;
		},
		/** Refetches the occlusion wherever it's shown, e.g. after the mask editor saves it; the old one shows meanwhile. */
		imageOcclusionChanged: (state, action: PayloadAction<string>) => {
			state.versions[action.payload] =
				(state.versions[action.payload] ?? 0) + 1;
		},
	},
});

export default imageOcclusionSlice.reducer;

export const { imageOcclusionLoaded, imageOcclusionChanged } =
	imageOcclusionSlice.actions;
