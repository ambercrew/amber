import { RootState } from "../store";

export const selectImageOcclusionLookup = (state: RootState, id: string) =>
	state.imageOcclusion.lookups[id] ?? null;

export const selectImageOcclusionVersion = (state: RootState, id: string) =>
	state.imageOcclusion.versions[id] ?? 0;
