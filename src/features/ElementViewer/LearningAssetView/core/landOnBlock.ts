import { scrollBlockIntoView } from "./scrollBlockIntoView";
import type { Land } from "./useSplitNavigator";

/** A landing that scrolls block `block` to the top, handing the block it landed on to `onLanded`. */
export function landOnBlock(
	block: number,
	onLanded?: (element: Element) => void,
): Land {
	return (root, scrollElement) => {
		const landed = scrollBlockIntoView(root, block, scrollElement);
		if (landed) onLanded?.(landed);
	};
}
