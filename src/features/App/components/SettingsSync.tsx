import { useEffect } from "react";
import { MantineColorScheme, useMantineColorScheme } from "@mantine/core";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { AppDispatch } from "../../../stores/store";
import { selectSettings } from "../../../stores/settings/settingsSelector";
import SettingsDto, { Theme } from "../../../api/settings/dto/settingsDto";
import { sync } from "../../../stores/sync/syncActions";
import { defaultCloseRequestedEventManager } from "../../../managers/closeRequestedEventManager";
import { tryGetCurrentWebView, isMobile } from "../../../utils/tauriUtils";
import { applyFontVariable } from "./fontCssUtils";

const SETTINGS_CLOSE_REQUESTED_HANDLER_NAME = "Settings handler";

const THEME_TO_COLOR_SCHEME: Record<Theme, MantineColorScheme> = {
	Light: "light",
	Dark: "dark",
	FollowSystem: "auto",
};

/**
 * Applies the user's settings to the environment: Mantine's color scheme, the
 * webview theme + zoom, and the body classes. Also (re)registers the
 * sync-on-close handler. Mantine components and the `light-dark()` CSS resolve
 * off `data-mantine-color-scheme`, so the setting must flow into Mantine here.
 */
async function applySettings(
	settings: SettingsDto,
	dispatch: AppDispatch,
	setColorScheme: (value: MantineColorScheme) => void,
) {
	try {
		document.body.classList.add("no-transition");

		setColorScheme(THEME_TO_COLOR_SCHEME[settings.theme]);

		applyFontVariable("--mantine-font-family", settings.font);
		applyFontVariable(
			"--mantine-font-family-headings",
			settings.fontHeadings,
		);
		applyFontVariable(
			"--mantine-font-family-monospace",
			settings.fontMonospace,
		);

		if (settings.theme === "FollowSystem") {
			// Making the window follow the operating system so that the next check is correct.
			await tryGetCurrentWebView()?.window.setTheme(null);
		}

		if (
			settings.theme === "Dark" ||
			(settings.theme === "FollowSystem" &&
				window.matchMedia?.("(prefers-color-scheme: dark)").matches)
		) {
			await tryGetCurrentWebView()?.window.setTheme("dark");
			document.body.classList.add("dark");
		} else {
			await tryGetCurrentWebView()?.window.setTheme("light");
			document.body.classList.remove("dark");
		}

		if (isMobile()) {
			document.body.classList.add("mobile");
		} else {
			document.body.classList.remove("mobile");
		}

		await tryGetCurrentWebView()?.setZoom(settings.zoomPercentage / 100);

		// Adding the event to the close manager is done here,
		// however sync on start is done on app start.
		defaultCloseRequestedEventManager.removeHandler(
			SETTINGS_CLOSE_REQUESTED_HANDLER_NAME,
		);
		defaultCloseRequestedEventManager.addHandler(
			SETTINGS_CLOSE_REQUESTED_HANDLER_NAME,
			{
				cb: async () => {
					if (settings.autoSync) await dispatch(sync());
				},
				// Must be executed after everything.
				priority: 9999,
			},
		);
	} finally {
		document.body.classList.remove("no-transition");
	}
}

/**
 * Keeps the environment in sync with the user's settings. Settings are loaded
 * into the store by `loadSettings`; this component reacts to those changes and
 * applies them, so applying is decoupled from the load/save thunks.
 */
function SettingsSync() {
	const settings = useAppSelector(selectSettings);
	const dispatch = useAppDispatch();
	const { setColorScheme } = useMantineColorScheme();

	useEffect(() => {
		if (!settings) return;
		void applySettings(settings, dispatch, setColorScheme);
	}, [settings, dispatch, setColorScheme]);

	return null;
}

export default SettingsSync;
