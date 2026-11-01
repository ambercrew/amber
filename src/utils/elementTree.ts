import { NodeDto } from "../api/elements/dto/nodeDto";

export function findTreeNode(
	nodes: NodeDto[],
	id: string,
): NodeDto | undefined {
	for (const node of nodes) {
		if (node.meta.elementId.id === id) return node;
		const { folders, learningAssets, extracts, cards } = node.children;
		const found = findTreeNode(
			[...folders, ...learningAssets, ...extracts, ...cards],
			id,
		);
		if (found) return found;
	}
	return undefined;
}
