import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import SettingsDto from "../../api/settings/dto/settingsDto";

export interface SettingsState {
	settings: SettingsDto | null;
}

const initialState: SettingsState = {
	settings: null,
};

const settingsSlice = createSlice({
	name: "settings",
	initialState,
	reducers: {
		setSettings: (state, payload: PayloadAction<SettingsDto>) => {
			state.settings = payload.payload;
		},
	},
});

export default settingsSlice.reducer;

export const { setSettings } = settingsSlice.actions;
