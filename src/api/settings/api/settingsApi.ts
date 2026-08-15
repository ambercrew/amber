import { invoke } from "@tauri-apps/api/core";
import SettingsDto from "../dto/settingsDto";
import UpdateSettingsRequestDto from "../dto/updateSettingsRequestDto";

export function getSettings(): Promise<SettingsDto> {
	return invoke("get_settings");
}

export function updateSettings(
	updateSettingsRequest: UpdateSettingsRequestDto,
): Promise<void> {
	return invoke("update_settings", {
		newSettings: updateSettingsRequest,
	});
}

export function listSystemFonts(): Promise<string[]> {
	return invoke("list_system_fonts");
}
