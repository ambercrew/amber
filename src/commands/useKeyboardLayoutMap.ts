import { useSyncExternalStore } from "react";

/** Chromium-only Keyboard Layout Map API (`navigator.keyboard`); absent from lib.dom.d.ts. */
interface NavigatorWithKeyboard extends Navigator {
	keyboard?: { getLayoutMap: () => Promise<ReadonlyMap<string, string>> };
}

// Shared by every caller, so each tooltip doesn't fetch the layout and re-render on its own.
let layoutMap: ReadonlyMap<string, string> | undefined;
const listeners = new Set<() => void>();

function sameLayout(
	a: ReadonlyMap<string, string> | undefined,
	b: ReadonlyMap<string, string>,
): boolean {
	if (a?.size !== b.size) return false;
	for (const [code, key] of a) if (b.get(code) !== key) return false;
	return true;
}

async function load() {
	const keyboard = (navigator as NavigatorWithKeyboard).keyboard;
	if (!keyboard) return;
	try {
		const next = await keyboard.getLayoutMap();
		// The API hands back a new map each time; only an actual layout change re-renders.
		if (sameLayout(layoutMap, next)) return;
		layoutMap = next;
		listeners.forEach(listener => listener());
	} catch {
		// Unsupported or blocked; callers fall back to US-layout labels.
	}
}

const reload = () => void load();

function subscribe(listener: () => void) {
	// The layout can change while the window is unfocused (e.g. the OS layout switcher), so refresh on refocus.
	if (listeners.size === 0) {
		window.addEventListener("focus", reload);
		reload();
	}
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) window.removeEventListener("focus", reload);
	};
}

/**
 * Maps a physical key's `KeyboardEvent.code` (e.g. `"KeyK"`) to the character
 * it produces under the user's active OS keyboard layout (e.g. `"к"` on
 * Russian). Only supported in Chromium-based webviews; resolves to
 * `undefined` elsewhere, letting callers fall back to the US-layout label.
 */
export function useKeyboardLayoutMap():
	ReadonlyMap<string, string> | undefined {
	return useSyncExternalStore(subscribe, () => layoutMap);
}
