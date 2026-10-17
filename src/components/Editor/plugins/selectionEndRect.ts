/** Whether the user dragged the selection from its end back towards its start. */
export function isBackwardSelection(selection: Selection, range: Range) {
	return (
		!range.collapsed &&
		(selection.anchorNode !== range.startContainer ||
			selection.anchorOffset !== range.startOffset)
	);
}

/**
 * A zero-width rect at the selection's moving end (where the pointer let go), spanning that
 * line's height. Placing the menu there keeps it near the pointer and on screen even when the
 * selection's other end has scrolled away.
 */
export function selectionEndRect(range: Range, backward: boolean): DOMRect {
	const rects = Array.from(range.getClientRects()).filter(
		rect => rect.width > 0 || rect.height > 0,
	);
	const edge = backward ? rects[0] : rects[rects.length - 1];
	if (!edge) return range.getBoundingClientRect();

	const line = rects.filter(
		rect => Math.abs(rect.top - edge.top) < edge.height / 2,
	);
	const lineLeft = Math.min(...line.map(rect => rect.left));
	const lineRight = Math.max(...line.map(rect => rect.right));
	const lineTop = Math.min(...line.map(rect => rect.top));
	const lineBottom = Math.max(...line.map(rect => rect.bottom));

	const caret = range.cloneRange();
	caret.collapse(backward);
	const caretRect = caret.getBoundingClientRect();
	// A caret at a line boundary can measure empty, so fall back to that end of the line.
	const hasCaret = caretRect.width > 0 || caretRect.height > 0;
	const x = hasCaret ? caretRect.left : backward ? lineLeft : lineRight;

	return new DOMRect(x, lineTop, 0, lineBottom - lineTop);
}
