import {
	getSettings,
	updateSettings,
} from "../../api/settings/api/settingsApi";
import { AppDispatch } from "../store";
import { setSettings } from "./settingsReducer";
import UpdateSettingsRequest from "../../api/settings/dto/updateSettingsRequest";

/** Loads the settings into the store. Applying them (theme, zoom, body
 * classes, sync-on-close) is handled reactively by the `SettingsSync`
 * component, not here. */
export function loadSettings() {
	return async function (dispatch: AppDispatch) {
		const settings = await getSettings();
		dispatch(setSettings(settings));
		return settings;
	};
}

/** Persists the given settings change and reloads the settings into the store.
 * The `SettingsSync` component reacts to the store change and applies them. */
export function saveSettings(request: UpdateSettingsRequest) {
	return async function (dispatch: AppDispatch) {
		await updateSettings(request);
		const settings = await getSettings();
		dispatch(setSettings(settings));
	};
}
