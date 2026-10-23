/** How a block's gutter markers (read point and marks) are arranged, from roomiest to tightest. */
export type GutterLayout = "row" | "column" | "compact";

export const GUTTER_MARKER_SIZE_IN_PX = 20;
export const GUTTER_MARKER_GAP_IN_PX = 4;
/** Space between the markers and the text. */
export const GUTTER_MARGIN_IN_PX = 6;
export const COMPACT_MARKER_WIDTH_IN_PX = 6;
export const COMPACT_MARKER_HEIGHT_IN_PX = 14;
export const COMPACT_MARKER_GAP_IN_PX = 2;
export const COMPACT_GUTTER_MARGIN_IN_PX = 3;

/** Side by side when they all fit in `gutterWidth`, stacked when one fits, otherwise as thin tabs. */
export function gutterLayout(count: number, gutterWidth: number): GutterLayout {
	const rowWidth =
		GUTTER_MARGIN_IN_PX +
		count * GUTTER_MARKER_SIZE_IN_PX +
		(count - 1) * GUTTER_MARKER_GAP_IN_PX;
	if (gutterWidth >= rowWidth) return "row";
	if (gutterWidth >= GUTTER_MARGIN_IN_PX + GUTTER_MARKER_SIZE_IN_PX)
		return "column";
	return "compact";
}

/** The nearest ancestor of `element` that clips horizontally, i.e. the left edge markers must stay within. */
export function clippingAncestorOf(element: HTMLElement): HTMLElement {
	for (
		let ancestor = element.parentElement;
		ancestor;
		ancestor = ancestor.parentElement
	) {
		if (getComputedStyle(ancestor).overflowX !== "visible") return ancestor;
	}
	return document.documentElement;
}
