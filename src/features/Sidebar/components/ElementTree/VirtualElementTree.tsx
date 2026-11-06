import {
	FlatTreeNode,
	FlatTreeNodeProps,
	FlattenedTreeNodeData,
	TreeDragDropPayload,
} from "@mantine/core";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import {
	ComponentPropsWithoutRef,
	KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useFocusOnRequest } from "../../../../hooks/useFocusRequest";
import { useVirtualListScroll } from "../../../../hooks/useVirtualListScroll";
import { useTreeDragDrop } from "./useTreeDragDrop";

/** Only a first guess: rows are measured once mounted. */
const ESTIMATED_ROW_HEIGHT = 32;
const OVERSCAN_ROWS = 10;

interface VirtualElementTreeProps extends ComponentPropsWithoutRef<"div"> {
	rows: FlattenedTreeNodeData[];
	tree: FlatTreeNodeProps["tree"];
	selectedValue: string | null;
	renamingValue: string | null;
	renderNode: FlatTreeNodeProps["renderNode"];
	onMove: (payload: TreeDragDropPayload) => void;
}

/** Mounts only the rows near the sidebar's scroll position. */
function VirtualElementTree({
	rows,
	tree,
	selectedValue,
	renamingValue,
	renderNode,
	onMove,
	style,
	...rootProps
}: VirtualElementTreeProps) {
	// The virtualizer changes in place, so the compiler would keep showing its first rows.
	"use no memo";

	const [root, setRoot] = useState<HTMLDivElement | null>(null);
	const { viewport, scrollMargin } = useVirtualListScroll(root);
	const [focused, setFocused] = useState<string | null>(null);
	const pendingFocus = useRef<string | null>(null);

	const rowIndexes = useMemo(
		() => new Map(rows.map((row, index) => [row.node.value, index])),
		[rows],
	);
	const { dragged, handlers } = useTreeDragDrop(rows, rowIndexes, onMove);

	const getItemKey = useCallback(
		(index: number) => rows[index].node.value,
		[rows],
	);
	// Unmounting these would lose the rename, the keyboard focus or the drag.
	const kept = [renamingValue, focused, dragged].flatMap(value => {
		const index = value === null ? undefined : rowIndexes.get(value);
		return index ?? [];
	});
	// eslint-disable-next-line react-hooks/incompatible-library -- skipped by the directive above
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => viewport,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		overscan: OVERSCAN_ROWS,
		scrollMargin,
		getItemKey,
		rangeExtractor: range =>
			[...new Set([...kept, ...defaultRangeExtractor(range)])].sort(
				(a, b) => a - b,
			),
	});
	const items = virtualizer.getVirtualItems();

	function focusRow(value: string) {
		pendingFocus.current = value;
		setFocused(value);
	}

	// Its row may only mount with this render, as it's kept once `focused` names it.
	useEffect(() => {
		if (pendingFocus.current === null) return;
		const row = root?.querySelector<HTMLElement>(
			`[role=treeitem][data-value="${CSS.escape(pendingFocus.current)}"]`,
		);
		pendingFocus.current = null;
		row?.setAttribute("data-focus-ring", "true");
		row?.focus();
	});

	useFocusOnRequest("tree", () => {
		const shown = selectedValue !== null && rowIndexes.has(selectedValue);
		const target = shown ? selectedValue : rows[0]?.node.value;
		if (target) focusRow(target);
	});

	/** `FlatTreeNode` moves among the mounted rows, where the row it's after may not be. */
	function focusUnmountedRow(event: KeyboardEvent<HTMLDivElement>) {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
			return;
		const { value } = (event.target as HTMLElement).dataset;
		const index = rowIndexes.get(value ?? "");
		if (index === undefined) return;
		const row = rows[index];
		const target = {
			ArrowLeft: row.expanded ? null : row.parent,
			ArrowDown: rows[index + 1]?.node.value,
			ArrowUp: rows[index - 1]?.node.value,
		}[event.code];
		if (!target || items.some(item => item.key === target)) return;
		event.stopPropagation();
		event.preventDefault();
		focusRow(target);
	}

	return (
		<div
			{...rootProps}
			{...handlers}
			ref={setRoot}
			role="tree"
			data-tree-root
			data-with-lines
			onKeyDownCapture={focusUnmountedRow}
			onFocus={event => {
				const { value } = (event.target as HTMLElement).dataset;
				if (value) setFocused(value);
			}}
			onBlur={event => {
				if (!event.currentTarget.contains(event.relatedTarget))
					setFocused(null);
			}}
			style={{
				...style,
				height: virtualizer.getTotalSize(),
				position: "relative",
				userSelect: "none",
			}}>
			{items.map((item, position) => (
				<div
					key={item.key}
					ref={virtualizer.measureElement}
					role="none"
					data-index={item.index}
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: "100%",
						transform: `translateY(${item.start - scrollMargin}px)`,
					}}>
					<FlatTreeNode
						{...rows[item.index]}
						tree={tree}
						renderNode={renderNode}
						tabIndex={position === 0 ? 0 : -1}
					/>
				</div>
			))}
		</div>
	);
}

export default VirtualElementTree;
