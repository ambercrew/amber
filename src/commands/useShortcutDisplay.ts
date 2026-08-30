import { useCallback } from "react";
import { useIsCoarsePointer } from "../hooks/useIsCoarsePointer";
import { formatShortcut } from "./formatShortcut";
import { useKeyboardLayoutMap } from "./useKeyboardLayoutMap";

/**
 * The single gate for showing a keyboard shortcut in the UI: it formats the
 * shortcut for display (in the user's active keyboard layout, where the
 * platform exposes one), and yields nothing on touch input, where there's no
 * keyboard to press it with. Every place that displays a shortcut (tooltips,
 * the command palette, command menu items) goes through this.
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
