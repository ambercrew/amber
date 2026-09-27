import { defaultTreeNodeFilter, TreeNodeData } from "@mantine/core";

export function getMatchingAncestors(
	nodes: TreeNodeData[],
	query: string,
): string[] {
	const result: string[] = [];
	for (const node of nodes) {
		const childMatches = node.children
			? getMatchingAncestors(node.children, query)
			: [];
		if (defaultTreeNodeFilter(query, node) || childMatches.length > 0) {
			result.push(node.value, ...childMatches);
		}
	}
	return result;
}

export function getAncestorsOf(
	nodes: TreeNodeData[],
	targetValue: string,
): string[] {
	for (const node of nodes) {
		if (node.value === targetValue) return [];
		const childPath = node.children
			? getAncestorsOf(node.children, targetValue)
			: null;
		if (childPath !== null) return [node.value, ...childPath];
	}
	return null!;
}

/** Node values in display order, skipping the children of collapsed nodes. */
export function getVisibleNodeValues(
	nodes: TreeNodeData[],
	expandedState: Record<string, boolean>,
): string[] {
	return nodes.flatMap(node => [
		node.value,
		...(node.children && expandedState[node.value]
			? getVisibleNodeValues(node.children, expandedState)
			: []),
	]);
}

/**
 * The visible node `offset` steps from `current`, or the first one when nothing is selected.
 * A `current` hidden in a collapsed node moves from that node; one missing from `nodes` yields null.
 */
export function getAdjacentNodeValue(
	nodes: TreeNodeData[],
	expandedState: Record<string, boolean>,
	current: string | null,
	offset: 1 | -1,
): string | null {
	const visible = getVisibleNodeValues(nodes, expandedState);
	if (current === null) return visible[0] ?? null;

	const index = visible.indexOf(current);
	if (index !== -1) return visible[index + offset] ?? null;

	const ancestors = getAncestorsOf(nodes, current) as string[] | null;
	const collapsedAncestor = ancestors?.find(
		value => !expandedState[value] && visible.includes(value),
	);
	if (!collapsedAncestor) return null;
	if (offset === -1) return collapsedAncestor;
	return visible[visible.indexOf(collapsedAncestor) + 1] ?? null;
}
