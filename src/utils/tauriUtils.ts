import { Webview, getCurrentWebview } from "@tauri-apps/api/webview";
import { getVersion } from "@tauri-apps/api/app";
import { type } from "@tauri-apps/plugin-os";

export function getAppVersion(): Promise<string> {
	return getVersion();
}

export function isMobile(): boolean {
	const osType = type();
	return osType === "android" || osType === "ios";
}

export function isAndroid() {
	return type() === "android";
}

export function isLinux() {
	return type() === "linux";
}

export function tryGetCurrentWebView(): Webview | null {
	if (isMobile()) {
		return null;
	}
	return getCurrentWebview();
}
