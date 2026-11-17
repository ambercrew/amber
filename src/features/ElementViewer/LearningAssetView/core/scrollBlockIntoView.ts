import { safeAreaTopInPx } from "../../../../utils/safeArea";
import { contentTopOf, hidesHeaderAt, jumpTo } from "./scrollGeometry";

/** Scrolls the block at `block` (or the last one, if out of range) to the top, returning it. */
export function scrollBlockIntoView(
	root: HTMLElement,
	block: number,
	scrollElement: HTMLElement | null,
): Element | undefined {
	const target =
		root.children[block] ?? root.children[root.children.length - 1];
	if (!target) return undefined;
	if (!scrollElement) {
		target.scrollIntoView({ block: "start" });
		return target;
	}
	const flushTop = contentTopOf(target, scrollElement);
	// Past the header's fixed zone the header is hidden, so the block goes flush with the top (below a phone's status bar).
	const hidesHeader = hidesHeaderAt(flushTop);
	const scrollPaddingTop =
		parseFloat(getComputedStyle(scrollElement).scrollPaddingTop) || 0;
	jumpTo(
		scrollElement,
		hidesHeader
			? flushTop - safeAreaTopInPx()
			: flushTop - scrollPaddingTop,
		hidesHeader,
	);
	return target;
}
