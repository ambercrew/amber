import { RootState } from "../store";

export const selectSettings = (state: RootState) => state.settings.settings;
export const selectAreSettingsLoaded = (state: RootState) =>
	state.settings.settings !== null;
