/** Chromium-only Keyboard Layout Map API (`navigator.keyboard`); absent from lib.dom.d.ts. */
interface NavigatorWithKeyboard extends Navigator {
	keyboard?: { getLayoutMap: () => Promise<ReadonlyMap<string, string>> };
}

function sameLayout(
	a: ReadonlyMap<string, string> | undefined,
	b: ReadonlyMap<string, string>,
): boolean {
	if (a?.size !== b.size) return false;
	for (const [code, key] of a) if (b.get(code) !== key) return false;
	return true;
}

/** Mirrors the OS keyboard layout for `useSyncExternalStore`, fetched once for every reader. */
export class KeyboardLayoutManager {
	private layoutMap: ReadonlyMap<string, string> | undefined;
	private readonly listeners = new Set<() => void>();
	private readonly reload = () => void this.load();

	private async load() {
		const keyboard = (navigator as NavigatorWithKeyboard).keyboard;
		if (!keyboard) return;
		try {
			const next = await keyboard.getLayoutMap();
			// The API hands back a new map each time; only an actual layout change re-renders.
			if (sameLayout(this.layoutMap, next)) return;
			this.layoutMap = next;
			this.listeners.forEach(listener => listener());
		} catch {
			// Unsupported or blocked; callers fall back to US-layout labels.
		}
	}

	readonly subscribe = (listener: () => void) => {
		// The layout can change while the window is unfocused (e.g. the OS layout switcher), so refresh on refocus.
		if (this.listeners.size === 0) {
			window.addEventListener("focus", this.reload);
			this.reload();
		}
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0)
				window.removeEventListener("focus", this.reload);
		};
	};

	readonly getSnapshot = () => this.layoutMap;
}

export const defaultKeyboardLayoutManager = new KeyboardLayoutManager();
