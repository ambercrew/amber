import {
	FlatTreeNodeProps,
	FlattenedTreeNodeData,
	TreeDragDropPayload,
} from "@mantine/core";
import { useEffect, useRef } from "react";
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
	/** Expands the ancestors of `value` so it can be focused; false when it isn't in the tree. */
	onReveal: (value: string) => boolean;
}

/** The sidebar's tree: a `VirtualTree` with drag and drop, and focus (revealing the selected row) on request. */
function VirtualElementTree({
	rows,
	tree,
	selectedValue,
	renamingValue,
	renderNode,
	onMove,
	onReveal,
	...rootProps
}: VirtualElementTreeProps) {
	const treeRef = useRef<VirtualTreeHandle>(null);
	const rowIndexes = useRowIndexes(rows);
	const { dragged, handlers } = useTreeDragDrop(rows, rowIndexes, onMove);

	// A hidden selected row is revealed first, then focused once its row exists.
	const revealing = useRef<string | null>(null);
	useFocusOnRequest("tree", () => {
		if (selectedValue !== null && !rowIndexes.has(selectedValue)) {
			if (onReveal(selectedValue)) {
				revealing.current = selectedValue;
				return;
			}
		}
		const shown = selectedValue !== null && rowIndexes.has(selectedValue);
		const target = shown ? selectedValue : rows[0]?.node.value;
		if (target) treeRef.current?.focusRow(target);
	});
	useEffect(() => {
		const value = revealing.current;
		if (value === null || !rowIndexes.has(value)) return;
		revealing.current = null;
		treeRef.current?.focusRow(value);
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
