import {
	MetaNodeDto,
	NodeChildrenDto,
	NodeDto,
} from "../api/elements/dto/nodeDto";
import { ElementNodeType } from "../types/elements/elementNodeType";

type ChildGroup = keyof NodeChildrenDto;

const CHILD_GROUPS: ChildGroup[] = [
	"folders",
	"learningAssets",
	"extracts",
	"cards",
];

const GROUP_BY_TYPE: Record<ElementNodeType, ChildGroup> = {
	folder: "folders",
	learningAsset: "learningAssets",
	extract: "extracts",
	card: "cards",
};

/** One step down from the root list (no `group`) or a node's children. */
export interface TreeStep {
	group: ChildGroup | null;
	index: number;
}

export function comparePositions(a: string, b: string) {
	if (a === b) return 0;
	return a < b ? -1 : 1;
}

export function findTreeNode(
	nodes: NodeDto[],
	id: string,
): NodeDto | undefined {
	for (const node of nodes) {
		if (node.meta.elementId.id === id) return node;
		for (const group of CHILD_GROUPS) {
			const found = findTreeNode(node.children[group], id);
			if (found) return found;
		}
	}
	return undefined;
}

export function collectTreeIds(nodes: NodeDto[], ids = new Set<string>()) {
	for (const node of nodes) {
		ids.add(node.meta.elementId.id);
		for (const group of CHILD_GROUPS)
			collectTreeIds(node.children[group], ids);
	}
	return ids;
}

/** The steps to a node, which replay on an Immer draft without walking (and proxying) all of it. */
export function findTreePath(
	nodes: NodeDto[],
	id: string,
	group: ChildGroup | null = null,
): TreeStep[] | null {
	for (const [index, node] of nodes.entries()) {
		const step = { group, index };
		if (node.meta.elementId.id === id) return [step];
		for (const childGroup of CHILD_GROUPS) {
			const rest = findTreePath(
				node.children[childGroup],
				id,
				childGroup,
			);
			if (rest) return [step, ...rest];
		}
	}
	return null;
}

/** The list holding the node `path` leads to, and that node. */
export function followTreePath(tree: NodeDto[], path: TreeStep[]) {
	let list = tree;
	let node = tree[path[0].index];
	for (const { group, index } of path.slice(1)) {
		// Only the first step has no group.
		list = node.children[group!];
		node = list[index];
	}
	return { list, node };
}

/** Adds `node` under `parent` (the root list without one), keeping the list in position order. */
export function insertTreeNode(
	tree: NodeDto[],
	parent: NodeDto | null,
	node: NodeDto,
) {
	const list = parent
		? parent.children[GROUP_BY_TYPE[node.meta.elementId.type]]
		: tree;
	// New elements are usually last, so the search starts there.
	let index = list.length;
	while (
		index > 0 &&
		comparePositions(list[index - 1].meta.position, node.meta.position) > 0
	)
		index--;
	list.splice(index, 0, node);
}

export function newTreeNode(meta: MetaNodeDto): NodeDto {
	return {
		meta,
		children: { folders: [], learningAssets: [], extracts: [], cards: [] },
	};
}
