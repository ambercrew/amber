import { useCallback } from "react";
import { useIsCoarsePointer } from "../hooks/useIsCoarsePointer";
import { formatShortcut } from "./formatShortcut";
import { useKeyboardLayoutMap } from "./useKeyboardLayoutMap";

/**
 * The one gate for showing a shortcut: formats it in the active keyboard layout and yields nothing on
 * touch, where there's no keyboard. Tooltips, the palette and command menu items all use it.
 */
export function useShortcutDisplay(): (
	shortcut: string | undefined,
) => string | undefined {
	const isCoarsePointer = useIsCoarsePointer();
	const layoutMap = useKeyboardLayoutMap();

	return useCallback(
		(shortcut: string | undefined) =>
			shortcut && !isCoarsePointer
				? formatShortcut(shortcut, layoutMap)
				: undefined,
		[isCoarsePointer, layoutMap],
	);
}
