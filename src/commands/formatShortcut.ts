const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

const KEY_SYMBOLS: Record<string, string> = isMac
	? { mod: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" }
	: { mod: "Ctrl", ctrl: "Ctrl", alt: "Alt", shift: "Shift" };

const SPECIAL: Record<string, string> = {
	arrowup: "↑",
	arrowdown: "↓",
	arrowleft: "←",
	arrowright: "→",
	enter: "↵",
	backspace: "⌫",
	escape: "Esc",
	tab: "Tab",
	space: "Space",
	"[plus]": "+",
};

/**
 * A shortcut's letters and digits name the physical key at its US-QWERTY spot (what `KeyboardEvent.code`
 * encodes), so this maps onto the `code` a layout map is keyed by.
 */
function codeForKey(key: string): string | undefined {
	if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
	if (/^[0-9]$/.test(key)) return `Digit${key}`;
	return undefined;
}

/**
 * A shortcut key's label, preferring the character the active layout produces there (e.g. `"К"` on
 * Russian) over the US letter in the shortcut string.
 */
function displayKey(key: string, layoutMap?: ReadonlyMap<string, string>) {
	const code = codeForKey(key);
	const produced = code && layoutMap?.get(code);
	return (produced ?? key).toUpperCase();
}

export function formatShortcut(
	shortcut: string,
	layoutMap?: ReadonlyMap<string, string>,
): string {
	const parts = shortcut.split("+").map(p => {
		const key = p.trim().toLowerCase();
		return KEY_SYMBOLS[key] ?? SPECIAL[key] ?? displayKey(key, layoutMap);
	});
	// A thin space keeps wide glyphs like ⌘ from running into the next key.
	return isMac ? parts.join(" ") : parts.join(" + ");
}
