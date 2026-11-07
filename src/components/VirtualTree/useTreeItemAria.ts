import { FlattenedTreeNodeData } from "@mantine/core";
import { useLayoutEffect, useMemo } from "react";

function siblingPositions(rows: FlattenedTreeNodeData[]) {
	const sizes = new Map<string | null, number>();
	const positions = rows.map(({ parent }) => {
		const position = (sizes.get(parent) ?? 0) + 1;
		sizes.set(parent, position);
		return position;
	});
	return { positions, sizes };
}

/** Flat, partly mounted rows can't convey their place in the tree, and `FlatTreeNode` takes no aria props. */
export function useTreeItemAria(
	root: HTMLElement | null,
	rows: FlattenedTreeNodeData[],
	rowIndexes: Map<string, number>,
) {
	const { positions, sizes } = useMemo(() => siblingPositions(rows), [rows]);

	// Every render, as rows mount while scrolling.
	useLayoutEffect(() => {
		root?.querySelectorAll<HTMLElement>("[role=treeitem]").forEach(item => {
			const index = rowIndexes.get(item.dataset.value ?? "");
			if (index === undefined) return;
			const { level, parent } = rows[index];
			item.setAttribute("aria-level", String(level));
			item.setAttribute("aria-posinset", String(positions[index]));
			item.setAttribute("aria-setsize", String(sizes.get(parent)));
		});
	});
}
