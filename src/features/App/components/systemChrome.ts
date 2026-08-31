import { isTauri } from "@tauri-apps/api/core";
import { notifications } from "@mantine/notifications";
import SettingsDto from "../../../api/settings/dto/settingsDto";
import { setSystemChromeTheme } from "../../../api/systemChrome/api/systemChromeApi";
import errorToString from "../../../utils/errorToString";

export function applyDocumentColorScheme(settings: SettingsDto): void {
	const colorScheme =
		settings.theme === "Dark"
			? "dark"
			: settings.theme === "Light"
				? "light"
				: "light dark";
	document.documentElement.style.colorScheme = colorScheme;

	const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
	if (colorSchemeMeta) {
		colorSchemeMeta.setAttribute("content", colorScheme);
	}
}

/**
 * Pushes the current body color into `<meta name="theme-color">` so OS chrome
 * (Android status bar, Windows title bar, Safari) tints to match the app.
 */
export function syncThemeColorMeta(): void {
	const color = getComputedStyle(document.body).backgroundColor;
	if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") {
		return;
	}

	document.querySelectorAll('meta[name="theme-color"]').forEach(el => {
		el.remove();
	});
	const meta = document.createElement("meta");
	meta.setAttribute("name", "theme-color");
	meta.setAttribute("content", color);
	document.head.appendChild(meta);
}

export async function applySystemChrome(settings: SettingsDto): Promise<void> {
	// The backend must release (or force) the webview theme *before* anything
	// reads `prefers-color-scheme`: while the window is still pinned to the
	// previous theme, the media query reports that theme rather than the OS
	// one, so a Dark -> FollowSystem switch would resolve back to dark.
	try {
		await setSystemChromeTheme(settings.theme);
	} catch (e) {
		// `npm run dev` serves the frontend in a plain browser, where there is
		// no backend to talk to and no OS chrome to theme.
		if (isTauri()) {
			// eslint-disable-next-line no-console
			console.error(e);
			notifications.show({ message: errorToString(e), color: "red" });
		}
	}

	applyDocumentColorScheme(settings);

	requestAnimationFrame(syncThemeColorMeta);
}
