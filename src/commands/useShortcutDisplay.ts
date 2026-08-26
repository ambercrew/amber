import { useCallback } from "react";
import { useIsCoarsePointer } from "../hooks/useIsCoarsePointer";
import { formatShortcut } from "./formatShortcut";

/**
 * The single gate for showing a keyboard shortcut in the UI: it formats the
 * shortcut for display, and yields nothing on touch input, where there's no
 * keyboard to press it with. Every place that displays a shortcut (tooltips,
 * the command palette, command menu items) goes through this.
 */
export function useShortcutDisplay(): (
	shortcut: string | undefined,
) => string | undefined {
	const isCoarsePointer = useIsCoarsePointer();

	return useCallback(
		(shortcut: string | undefined) =>
			shortcut && !isCoarsePointer ? formatShortcut(shortcut) : undefined,
		[isCoarsePointer],
	);
}
