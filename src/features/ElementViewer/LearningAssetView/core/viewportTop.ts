import { HEADROOM_FIXED_AT } from "../../../App/components/App";
import { safeAreaTopInPx } from "../../../../utils/safeArea";
import { LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX } from "./learningAssetViewConstants";

/** Viewport y where a block scrolled to the top lands: the scroller's top (below a phone's status bar), or below the header within `HEADROOM_FIXED_AT`. */
export function viewportTop(scrollElement: HTMLElement | null): number {
	if (!scrollElement) return LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX;
	const { top } = scrollElement.getBoundingClientRect();
	if (scrollElement.scrollTop > HEADROOM_FIXED_AT)
		return top + safeAreaTopInPx();
	const scrollPaddingTop =
		parseFloat(getComputedStyle(scrollElement).scrollPaddingTop) || 0;
	return top + scrollPaddingTop;
}
