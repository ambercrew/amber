import { ReadingPosition } from "../../../types/elements/readingPosition";
import { blockFraction } from "../marks/markLogic";

/**
 * The `scrollTop` that jumping to `anchor` lands `scrollElement` on, or `null` when its split isn't in the page.
 * Uses the mounted block's real position, else its share of the split's placeholder.
 */
export function landingScrollTop(
	scrollElement: HTMLElement,
	anchor: ReadingPosition,
	contentRoot: HTMLElement | undefined,
	blockCount: number,
): number | null {
	const slot = scrollElement.querySelector(`[data-seq="${anchor.split}"]`);
	const content = slot?.lastElementChild;
	if (!content) return null;

	const blocks = contentRoot?.children;
	let top: number;
	if (blocks && blocks.length > 0) {
		const block = blocks[anchor.block] ?? blocks[blocks.length - 1];
		top = block.getBoundingClientRect().top;
	} else {
		const rect = content.getBoundingClientRect();
		top = rect.top + rect.height * blockFraction(anchor.block, blockCount);
	}

	const scrollPaddingTop =
		parseFloat(getComputedStyle(scrollElement).scrollPaddingTop) || 0;
	const scrollTop =
		top -
		scrollElement.getBoundingClientRect().top +
		scrollElement.scrollTop -
		scrollPaddingTop;
	const maxScrollTop =
		scrollElement.scrollHeight - scrollElement.clientHeight;
	return Math.min(Math.max(scrollTop, 0), Math.max(maxScrollTop, 0));
}
