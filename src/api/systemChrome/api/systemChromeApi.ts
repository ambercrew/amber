import { invoke } from "@tauri-apps/api/core";
import { Theme } from "../../settings/dto/settingsDto";

export function setSystemChromeTheme(theme: Theme): Promise<void> {
	return invoke("set_system_chrome_theme", { theme });
}
