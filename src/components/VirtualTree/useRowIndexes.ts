import { FlattenedTreeNodeData } from "@mantine/core";
import { useMemo } from "react";

/** Each row's value and its index in `rows`, as `VirtualTree` takes them. */
export function useRowIndexes(rows: FlattenedTreeNodeData[]) {
	return useMemo(
		() => new Map(rows.map((row, index) => [row.node.value, index])),
		[rows],
	);
}
