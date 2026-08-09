import { invoke } from "@tauri-apps/api/core";
import UpdateSettingsRequestDto from "../dto/updateSettingsRequestDto";
import UpdateSettingsRequest from "../dto/updateSettingsRequest";

export function getSettings(): Promise<UpdateSettingsRequestDto> {
	return invoke("get_settings");
}

export function updateSettings(
	updateSettingsRequest: UpdateSettingsRequest,
): Promise<void> {
	return invoke("update_settings", {
		newSettings: updateSettingsRequest,
	});
}
