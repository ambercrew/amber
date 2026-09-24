import { TreeNodeData } from "@mantine/core";
import { NodeDto } from "../../../../api/elements/dto/nodeDto";
import { ElementNodeType } from "../../../../types/elements/elementNodeType";
import { ElementNodeProps } from "./elementNodeProps";

export function dtosToTreeData(nodes: NodeDto[]): TreeNodeData[] {
	return nodes.map(f => nodeToTreeNode(f));
}

function nodeToTreeNode(node: NodeDto): TreeNodeData {
	const children = [
		...node.children.folders.map(nodeToTreeNode),
		...node.children.learningAssets.map(nodeToTreeNode),
		...node.children.extracts.map(nodeToTreeNode),
		...node.children.cards.map(nodeToTreeNode),
	];
	children.sort((a, b) => {
		return (a.nodeProps as ElementNodeProps).position.localeCompare(
			(b.nodeProps as ElementNodeProps).position,
		);
	});
	return {
		label: node.meta.name,
		value: node.meta.elementId.id,
		nodeProps: {
			type: node.meta.elementId.type,
			childrenCount: children.length,
			position: node.meta.position,
		} satisfies ElementNodeProps,
		children,
		// NOTE: Mantine only offers an "inside" drop zone on nodes with children, so
		// childless elements must opt in explicitly.
		hasChildren: true,
	};
}

export function findNodeType(
	nodes: TreeNodeData[],
	value: string,
): ElementNodeType | null {
	for (const node of nodes) {
		if (node.value === value)
			return (node.nodeProps as ElementNodeProps).type;
		if (node.children) {
			const found = findNodeType(node.children, value);
			if (found) return found;
		}
	}
	return null;
}
