import type { Land } from "./useSplitNavigator";
import { contentTopOf, hidesHeaderAt, jumpTo } from "./scrollGeometry";
import { ViewPosition } from "../../../../types/elements/viewPosition";

/** A landing that puts `scrollTop` back where `anchors.topVisible()` found it, relative to its block. */
export function landOnViewPosition({ block, offset }: ViewPosition): Land {
	return (root, scrollElement) => {
		const target =
			root.children[block] ?? root.children[root.children.length - 1];
		if (!target || !scrollElement) return;
		const top = contentTopOf(target, scrollElement) + offset;
		jumpTo(scrollElement, top, hidesHeaderAt(top));
	};
}
