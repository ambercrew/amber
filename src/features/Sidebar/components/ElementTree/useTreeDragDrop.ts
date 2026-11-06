import { DragEvent, useRef, useState } from "react";
import { FlattenedTreeNodeData, TreeDragDropPayload } from "@mantine/core";

type DropPosition = TreeDragDropPayload["position"];

function dropPosition(
	event: DragEvent,
	label: HTMLElement,
	expanded: boolean,
): DropPosition {
	const { top, height } = label.getBoundingClientRect();
	const y = event.clientY - top;
	if (expanded) return y < height * 0.5 ? "before" : "inside";
	if (y < height * 0.25) return "before";
	return y > height * 0.75 ? "after" : "inside";
}

function labelOf(event: DragEvent) {
	return (event.target as HTMLElement).closest<HTMLElement>(
		"[draggable][data-value]",
	);
}

/**
 * Drag and drop for the rows, which `FlatTreeNode` lacks. It sits on the tree rather than on each
 * row because rows come and go as the tree scrolls, and marks them as Mantine's styles expect.
 */
export function useTreeDragDrop(
	rows: FlattenedTreeNodeData[],
	rowIndexes: Map<string, number>,
	onMove: (payload: TreeDragDropPayload) => void,
) {
	const [dragged, setDragged] = useState<string | null>(null);
	const dropTarget = useRef<HTMLElement | null>(null);

	function isInside(value: string, ancestor: string) {
		let current = rows[rowIndexes.get(value) ?? -1]?.parent;
		while (current) {
			if (current === ancestor) return true;
			current = rows[rowIndexes.get(current) ?? -1]?.parent;
		}
		return false;
	}

	function clearDropTarget() {
		dropTarget.current?.removeAttribute("data-drag-over");
		dropTarget.current = null;
	}

	return {
		dragged,
		handlers: {
			onDragStart: (event: DragEvent) => {
				const label = labelOf(event);
				const value = label?.dataset.value;
				if (!label || !value) return;
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", value);
				setDragged(value);
				label
					.closest("[role=treeitem]")
					?.setAttribute("data-dragging", "true");
				// Set a frame later, or the drag image would be the faded row.
				requestAnimationFrame(() =>
					label.setAttribute("data-dragging", "true"),
				);
			},
			onDragOver: (event: DragEvent) => {
				const label = labelOf(event);
				const value = label?.dataset.value;
				const row = rows[rowIndexes.get(value ?? "") ?? -1];
				if (
					!label ||
					!value ||
					!row ||
					!dragged ||
					value === dragged ||
					isInside(value, dragged)
				)
					return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				if (dropTarget.current !== label) clearDropTarget();
				label.setAttribute(
					"data-drag-over",
					dropPosition(event, label, row.expanded),
				);
				dropTarget.current = label;
			},
			onDragLeave: (event: DragEvent) => {
				const label = labelOf(event);
				if (label?.contains(event.relatedTarget as Node | null)) return;
				if (label === dropTarget.current) clearDropTarget();
			},
			onDrop: (event: DragEvent) => {
				event.preventDefault();
				const label = dropTarget.current;
				const position = label?.getAttribute("data-drag-over");
				const targetNode = label?.dataset.value;
				clearDropTarget();
				if (dragged && targetNode && position)
					onMove({
						draggedNode: dragged,
						targetNode,
						position: position as DropPosition,
					});
			},
			onDragEnd: (event: DragEvent) => {
				const label = labelOf(event);
				label?.removeAttribute("data-dragging");
				label
					?.closest("[role=treeitem]")
					?.removeAttribute("data-dragging");
				clearDropTarget();
				setDragged(null);
			},
		},
	};
}
