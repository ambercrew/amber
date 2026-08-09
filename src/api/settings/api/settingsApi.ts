import { invoke } from "@tauri-apps/api/core";
import SettingsDto from "../dto/settingsDto";
import UpdateSettingsRequest from "../dto/updateSettingsRequest";

export function getSettings(): Promise<SettingsDto> {
	return invoke("get_settings");
}

export function updateSettings(
	updateSettingsRequest: UpdateSettingsRequest,
): Promise<void> {
	return invoke("update_settings", {
		newSettings: updateSettingsRequest,
	});
}
