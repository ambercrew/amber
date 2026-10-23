/** Scrolls the block at `block` (or the last block, if out of range) to the top of the viewport, returning it. */
export function scrollBlockIntoView(
	root: HTMLElement,
	block: number,
): Element | undefined {
	const target =
		root.children[block] ?? root.children[root.children.length - 1];
	target?.scrollIntoView({ block: "start" });
	return target;
}
