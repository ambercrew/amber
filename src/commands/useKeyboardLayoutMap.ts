import { useSyncExternalStore } from "react";
import { defaultKeyboardLayoutManager } from "../managers/keyboardLayoutManager";

/**
 * Maps a `KeyboardEvent.code` (e.g. `"KeyK"`) to the character the active layout produces (e.g. `"к"`);
 * Chromium webviews only, `undefined` elsewhere, so callers fall back to US labels.
 */
export function useKeyboardLayoutMap():
	ReadonlyMap<string, string> | undefined {
	return useSyncExternalStore(
		defaultKeyboardLayoutManager.subscribe,
		defaultKeyboardLayoutManager.getSnapshot,
	);
}
