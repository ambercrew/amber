import { HEADROOM_FIXED_AT } from "../../../App/components/App";
import { hideHeadroom } from "../../../../hooks/useElementHeadroom";

/** `element`'s top within the scroller's content, independent of the current scroll. */
export function contentTopOf(
	element: Element,
	scrollElement: HTMLElement,
): number {
	return (
		element.getBoundingClientRect().top -
		scrollElement.getBoundingClientRect().top +
		scrollElement.scrollTop
	);
}

/** Whether a block at content offset `top` lands past the header's fixed zone, where the header hides. */
export function hidesHeaderAt(top: number): boolean {
	return top > HEADROOM_FIXED_AT;
}

/** Jumps to `top` without animating, hiding the header if asked, as every landing does. */
export function jumpTo(
	scrollElement: HTMLElement,
	top: number,
	hideHeader: boolean,
) {
	scrollElement.scrollTo({ top: Math.max(0, top), behavior: "instant" });
	if (hideHeader) hideHeadroom(scrollElement);
}
