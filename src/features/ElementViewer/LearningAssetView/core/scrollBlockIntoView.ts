import { HEADROOM_FIXED_AT } from "../../../App/components/App";
import { hideHeadroom } from "../../../../hooks/useElementHeadroom";
import { safeAreaTopInPx } from "../../../../utils/safeArea";

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
	const flushTop =
		target.getBoundingClientRect().top -
		scrollElement.getBoundingClientRect().top +
		scrollElement.scrollTop;
	// Past `HEADROOM_FIXED_AT` the header is hidden, so the block goes flush with the top (below a phone's status bar).
	const hidesHeader = flushTop > HEADROOM_FIXED_AT;
	const scrollPaddingTop =
		parseFloat(getComputedStyle(scrollElement).scrollPaddingTop) || 0;
	scrollElement.scrollTo({
		top: hidesHeader
			? flushTop - safeAreaTopInPx()
			: Math.max(0, flushTop - scrollPaddingTop),
		behavior: "instant",
	});
	if (hidesHeader) hideHeadroom(scrollElement);
	return target;
}
