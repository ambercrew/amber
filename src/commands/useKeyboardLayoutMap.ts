import { useEffect, useState } from "react";

/** Chromium-only Keyboard Layout Map API (`navigator.keyboard`); absent from lib.dom.d.ts. */
interface NavigatorWithKeyboard extends Navigator {
	keyboard?: { getLayoutMap: () => Promise<ReadonlyMap<string, string>> };
}

/**
 * Maps a physical key's `KeyboardEvent.code` (e.g. `"KeyK"`) to the character
 * it produces under the user's active OS keyboard layout (e.g. `"к"` on
 * Russian). Only supported in Chromium-based webviews; resolves to
 * `undefined` elsewhere, letting callers fall back to the US-layout label.
 */
export function useKeyboardLayoutMap():
	ReadonlyMap<string, string> | undefined {
	const [map, setMap] = useState<ReadonlyMap<string, string>>();

	useEffect(() => {
		let cancelled = false;

		async function load() {
			const keyboard = (navigator as NavigatorWithKeyboard).keyboard;
			if (!keyboard) return;
			try {
				const result = await keyboard.getLayoutMap();
				if (!cancelled) setMap(result);
			} catch {
				// Unsupported or blocked; callers fall back to US-layout labels.
			}
		}

		const reload = () => void load();

		reload();
		// The layout can change while the window is unfocused (e.g. the OS
		// keyboard layout switcher), so refresh on refocus rather than once.
		window.addEventListener("focus", reload);
		return () => {
			cancelled = true;
			window.removeEventListener("focus", reload);
		};
	}, []);

	return map;
}
