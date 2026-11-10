import {
	FlatTreeNodeProps,
	FlattenedTreeNodeData,
	TreeDragDropPayload,
} from "@mantine/core";
import { useRef } from "react";
import { useRowIndexes } from "../../../../components/VirtualTree/useRowIndexes";
import VirtualTree, {
	VirtualTreeHandle,
	VirtualTreeRootProps,
} from "../../../../components/VirtualTree/VirtualTree";
import { useFocusOnRequest } from "../../../../hooks/useFocusRequest";
import { useTreeDragDrop } from "./useTreeDragDrop";

interface VirtualElementTreeProps extends VirtualTreeRootProps {
	rows: FlattenedTreeNodeData[];
	tree: FlatTreeNodeProps["tree"];
	selectedValue: string | null;
	renamingValue: string | null;
	renderNode: FlatTreeNodeProps["renderNode"];
	onMove: (payload: TreeDragDropPayload) => void;
}

/** The sidebar's tree: a `VirtualTree` with drag and drop, and focus on request. */
function VirtualElementTree({
	rows,
	tree,
	selectedValue,
	renamingValue,
	renderNode,
	onMove,
	...rootProps
}: VirtualElementTreeProps) {
	const treeRef = useRef<VirtualTreeHandle>(null);
	const rowIndexes = useRowIndexes(rows);
	const { dragged, handlers } = useTreeDragDrop(rows, rowIndexes, onMove);

	useFocusOnRequest("tree", () => {
		const shown = selectedValue !== null && rowIndexes.has(selectedValue);
		const target = shown ? selectedValue : rows[0]?.node.value;
		if (target) treeRef.current?.focusRow(target);
	});

	return (
		<VirtualTree
			{...rootProps}
			{...handlers}
			ref={treeRef}
			rows={rows}
			rowIndexes={rowIndexes}
			tree={tree}
			renderNode={renderNode}
			keptValues={[renamingValue, dragged]}
		/>
	);
}

export default VirtualElementTree;
