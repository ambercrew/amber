import { Table } from "@mantine/core";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { FocusEvent, ReactNode, useCallback, useMemo, useState } from "react";
import { SearchElementResultDto } from "../../api/search/dto/searchElementResultDto";
import { useVirtualListScroll } from "../../hooks/useVirtualListScroll";
import { elementKey } from "../../utils/elementKey";
import SearchResultRow from "./SearchResultRow";

/** Only a first guess: rows are measured once mounted, and names and tags can wrap. */
const ESTIMATED_ROW_HEIGHT = 43;
const OVERSCAN_ROWS = 10;

interface SpacerRowProps {
	height: number;
	columnCount: number;
}

function SpacerRow({ height, columnCount }: SpacerRowProps) {
	return (
		<tr aria-hidden="true" style={{ height }}>
			<td colSpan={columnCount} style={{ padding: 0 }} />
		</tr>
	);
}

interface SearchResultRowsProps {
	results: SearchElementResultDto[];
	selectedKeys: Set<string>;
	selectable: boolean;
	onToggle: (
		result: SearchElementResultDto,
		index: number,
		shiftKey: boolean,
	) => void;
}

/** Mounts only the rows near the scroll position; spacer rows stand in for the others. */
export default function SearchResultRows({
	results,
	selectedKeys,
	selectable,
	onToggle,
}: SearchResultRowsProps) {
	// The virtualizer changes in place, so the compiler would keep showing its first rows.
	"use no memo";

	const [root, setRoot] = useState<HTMLTableSectionElement | null>(null);
	const { viewport, scrollMargin } = useVirtualListScroll(root);
	const [focusedId, setFocusedId] = useState<string | null>(null);

	const focusedIndex = useMemo(
		() => results.findIndex(result => result.id === focusedId),
		[results, focusedId],
	);
	const getItemKey = useCallback(
		(index: number) => results[index].id,
		[results],
	);
	// eslint-disable-next-line react-hooks/incompatible-library -- skipped by the directive above
	const virtualizer = useVirtualizer({
		count: results.length,
		getScrollElement: () => viewport,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		overscan: OVERSCAN_ROWS,
		scrollMargin,
		getItemKey,
		// Unmounting the focused row would drop keyboard focus to the page.
		rangeExtractor: range =>
			[...new Set([...defaultRangeExtractor(range), focusedIndex])]
				.filter(index => index >= 0)
				.sort((a, b) => a - b),
	});

	function trackFocus(event: FocusEvent<HTMLTableSectionElement>) {
		const row = event.target.closest("tr");
		setFocusedId(results[Number(row?.dataset.index)]?.id ?? null);
	}

	function clearFocus(event: FocusEvent<HTMLTableSectionElement>) {
		if (!event.currentTarget.contains(event.relatedTarget)) {
			setFocusedId(null);
		}
	}

	const columnCount = selectable ? 6 : 5;
	const rows: ReactNode[] = [];
	let renderedEnd = scrollMargin;
	for (const item of virtualizer.getVirtualItems()) {
		// A focused row kept far from the window leaves a gap on its other side too.
		if (item.start > renderedEnd) {
			rows.push(
				<SpacerRow
					key={`gap-${item.key}`}
					height={item.start - renderedEnd}
					columnCount={columnCount}
				/>,
			);
		}
		// Striping counts rows, so this keeps a row's stripe as the window moves.
		if ((rows.length + item.index) % 2 !== 0) {
			rows.push(
				<SpacerRow
					key={`stripe-${item.key}`}
					height={0}
					columnCount={columnCount}
				/>,
			);
		}
		const result = results[item.index];
		rows.push(
			<SearchResultRow
				key={item.key}
				result={result}
				index={item.index}
				selectable={selectable}
				selected={selectedKeys.has(elementKey(result))}
				onToggle={onToggle}
				rowRef={virtualizer.measureElement}
			/>,
		);
		renderedEnd = item.end;
	}
	const heightBelow = virtualizer.getTotalSize() + scrollMargin - renderedEnd;

	return (
		// In-flow rows would have the browser's scroll anchoring fight the virtualizer's.
		<Table.Tbody
			ref={setRoot}
			onFocus={trackFocus}
			onBlur={clearFocus}
			style={{ overflowAnchor: "none" }}>
			{rows}
			{rows.length > 0 && heightBelow > 0 && (
				<SpacerRow height={heightBelow} columnCount={columnCount} />
			)}
		</Table.Tbody>
	);
}
