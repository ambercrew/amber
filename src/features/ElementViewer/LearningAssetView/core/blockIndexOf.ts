/** Index of the top-level block of `root` containing `node`, or `null` when `node` is outside it. */
export function blockIndexOf(
	root: HTMLElement,
	node: Node | null,
): number | null {
	let current = node;
	while (current && current.parentNode !== root) current = current.parentNode;
	if (!current) return null;
	return Array.prototype.indexOf.call(root.children, current) as number;
}

/** Whether any of `root`'s block `block` lies between the viewport's top offset and `viewportBottom`. */
export function isBlockInViewport(
	root: HTMLElement,
	block: number,
	topOffset: number,
	viewportBottom: number,
): boolean {
	const element = root.children[block];
	if (!element) return false;
	const rect = element.getBoundingClientRect();
	return rect.bottom > topOffset && rect.top < viewportBottom;
}
