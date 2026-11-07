import {
	FlatTreeNode,
	FlatTreeNodeProps,
	FlattenedTreeNodeData,
} from "@mantine/core";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import {
	ComponentPropsWithoutRef,
	Ref,
	useCallback,
	useEffect,
	useEffectEvent,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useVirtualListScroll } from "../../hooks/useVirtualListScroll";
import { useTreeItemAria } from "./useTreeItemAria";

/** Only a first guess: rows are measured once mounted. */
const ESTIMATED_ROW_HEIGHT = 32;
const OVERSCAN_ROWS = 10;

export interface VirtualTreeHandle {
	/** Mounts the row if needed and focuses it. */
	focusRow: (value: string) => void;
	/** Scrolls the row to the top of the scroll area, mounted or not. */
	scrollRowToTop: (value: string) => void;
}

/** The root's own props, without those `VirtualTree` needs for itself. */
export type VirtualTreeRootProps = Omit<
	ComponentPropsWithoutRef<"div">,
	"role" | "onFocus" | "onBlur"
>;

interface VirtualTreeProps extends VirtualTreeRootProps {
	rows: FlattenedTreeNodeData[];
	/** From `useRowIndexes`. */
	rowIndexes: Map<string, number>;
	tree: FlatTreeNodeProps["tree"];
	renderNode: FlatTreeNodeProps["renderNode"];
	expandOnClick?: boolean;
	/** Rows to keep mounted off screen, as unmounting them would lose their state. */
	keptValues?: (string | null)[];
	ref?: Ref<VirtualTreeHandle>;
}

/** A Mantine tree that mounts only the rows near its scroll area's position. */
function VirtualTree({
	rows,
	rowIndexes,
	tree,
	renderNode,
	expandOnClick,
	keptValues = [],
	ref,
	style,
	...rootProps
}: VirtualTreeProps) {
	// The virtualizer changes in place, so the compiler would keep showing its first rows.
	"use no memo";

	const [root, setRoot] = useState<HTMLDivElement | null>(null);
	const { viewport, scrollMargin } = useVirtualListScroll(root);
	const [focused, setFocused] = useState<string | null>(null);
	const pendingFocus = useRef<string | null>(null);

	const getItemKey = useCallback(
		(index: number) => rows[index].node.value,
		[rows],
	);
	// Unmounting the focused row would drop keyboard focus to the page.
	const kept = [...keptValues, focused].flatMap(value => {
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
	// Overscan rows are off screen, and tabbing to one would make the tree jump.
	const tabStop =
		rowIndexes.get(focused ?? "") ?? virtualizer.range?.startIndex ?? 0;
	useTreeItemAria(root, rows, rowIndexes);

	const focusRow = useCallback((value: string) => {
		pendingFocus.current = value;
		setFocused(value);
	}, []);

	useImperativeHandle(
		ref,
		() => ({
			focusRow,
			scrollRowToTop: value => {
				const index = rowIndexes.get(value);
				if (index !== undefined)
					virtualizer.scrollToIndex(index, { align: "start" });
			},
		}),
		[focusRow, rowIndexes, virtualizer],
	);

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

	/** `FlatTreeNode` moves among the mounted rows, where the row it's after may not be. */
	const focusUnmountedRow = useEffectEvent((event: KeyboardEvent) => {
		const { value } = (event.target as HTMLElement).dataset;
		const index = rowIndexes.get(value ?? "");
		if (index === undefined) return;
		const row = rows[index];
		const opensDown = row.expanded && row.hasChildren;
		const target = {
			ArrowLeft: opensDown ? null : row.parent,
			ArrowRight: opensDown ? rows[index + 1]?.node.value : null,
			ArrowDown: rows[index + 1]?.node.value,
			ArrowUp: rows[index - 1]?.node.value,
		}[event.code];
		if (!target || items.some(item => item.key === target)) return;
		event.stopPropagation();
		event.preventDefault();
		focusRow(target);
	});

	// Native, as React's capture phase would run before the sidebar's shortcut pass-through.
	useEffect(() => {
		if (!root) return;
		const onKeyDown = (event: KeyboardEvent) => focusUnmountedRow(event);
		root.addEventListener("keydown", onKeyDown, { capture: true });
		return () =>
			root.removeEventListener("keydown", onKeyDown, { capture: true });
	}, [root]);

	return (
		<div
			{...rootProps}
			ref={setRoot}
			role="tree"
			data-tree-root
			data-with-lines
			onFocus={event => {
				const row = (event.target as HTMLElement).closest<HTMLElement>(
					"[role=treeitem]",
				);
				if (row?.dataset.value) setFocused(row.dataset.value);
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
			{items.map(item => (
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
						expandOnClick={expandOnClick}
						tabIndex={item.index === tabStop ? 0 : -1}
					/>
				</div>
			))}
		</div>
	);
}

export default VirtualTree;
