import { useMemo } from "react";
import { NodeDto } from "../../../api/elements/dto/nodeDto";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectElementTree } from "../../../stores/elements/elementsSelectors";
import { ElementId } from "../../../types/elements/elementId";

export interface FolderTrailItem {
	id: string;
	name: string;
}

function childNodes(node: NodeDto): NodeDto[] {
	return [
		...node.children.folders,
		...node.children.learningAssets,
		...node.children.extracts,
		...node.children.cards,
	];
}

function findPath(nodes: NodeDto[], id: string): NodeDto[] | null {
	for (const node of nodes) {
		if (node.meta.elementId.id === id) return [node];
		const rest = findPath(childNodes(node), id);
		if (rest) return [node, ...rest];
	}
	return null;
}

/** The folders from the root down to the given one, for the breadcrumb trail.
 * Empty at Home, and for a folder missing from the tree (e.g. trashed) it's
 * just that folder. */
export function useFolderTrail(
	folderId: ElementId | null,
	folderName: string | null,
): FolderTrailItem[] {
	const tree = useAppSelector(selectElementTree);

	return useMemo(() => {
		if (!folderId) return [];
		const path = findPath(tree, folderId.id);
		if (!path) return [{ id: folderId.id, name: folderName ?? "" }];
		return path.map(node => ({
			id: node.meta.elementId.id,
			name: node.meta.name,
		}));
	}, [tree, folderId, folderName]);
}
