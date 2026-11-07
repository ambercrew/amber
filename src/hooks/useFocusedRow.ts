import { defaultRangeExtractor, Range } from "@tanstack/react-virtual";
import { FocusEvent, useMemo, useState } from "react";

/**
 * Keeps a virtualized list's focused row mounted, as unmounting it would drop
 * keyboard focus to the page. Rows need `data-index`; `getId` must be stable.
 */
export function useFocusedRow<T>(rows: T[], getId: (row: T) => string) {
	const [focusedId, setFocusedId] = useState<string | null>(null);

	const focusedIndex = useMemo(
		() => rows.findIndex(row => getId(row) === focusedId),
		[rows, getId, focusedId],
	);

	function onFocus(event: FocusEvent<HTMLElement>) {
		const row = event.target.closest<HTMLElement>("[data-index]");
		const focused = rows[Number(row?.dataset.index)] as T | undefined;
		setFocusedId(focused === undefined ? null : getId(focused));
	}

	function onBlur(event: FocusEvent<HTMLElement>) {
		// The element stays active while another window has focus, and regains it on return.
		const windowLostFocus = document.activeElement === event.target;

		if (
			!windowLostFocus &&
			!event.currentTarget.contains(event.relatedTarget)
		) {
			setFocusedId(null);
		}
	}

	function rangeExtractor(range: Range) {
		return [...new Set([...defaultRangeExtractor(range), focusedIndex])]
			.filter(index => index >= 0)
			.sort((a, b) => a - b);
	}

	return { focusProps: { onFocus, onBlur }, rangeExtractor };
}
