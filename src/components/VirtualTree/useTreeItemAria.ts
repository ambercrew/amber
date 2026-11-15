import { FlattenedTreeNodeData } from "@mantine/core";
import { useLayoutEffect, useMemo, useRef } from "react";

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
	// The rows each item was last labelled for: while scrolling, only newly mounted items need it.
	const labelledFor = useRef(new WeakMap<Element, FlattenedTreeNodeData[]>());

	// Every render, as rows mount while scrolling.
	useLayoutEffect(() => {
		if (!root) return;
		// `VirtualTree` wraps each item in a positioned row of its own.
		for (const row of root.children) {
			const item = row.firstElementChild;
			if (!(item instanceof HTMLElement)) continue;
			if (labelledFor.current.get(item) === rows) continue;
			const index = rowIndexes.get(item.dataset.value ?? "");
			if (index === undefined) continue;
			const { level, parent } = rows[index];
			item.setAttribute("aria-level", String(level));
			item.setAttribute("aria-posinset", String(positions[index]));
			item.setAttribute("aria-setsize", String(sizes.get(parent)));
			labelledFor.current.set(item, rows);
		}
	});
}
