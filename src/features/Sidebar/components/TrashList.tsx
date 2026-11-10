import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useState } from "react";
import { TrashedElementDto } from "../../../api/trash/dto/trashedElementDto";
import { useElementParams } from "../../../hooks/useElementParams";
import { useFocusedRow } from "../../../hooks/useFocusedRow";
import { useVirtualListScroll } from "../../../hooks/useVirtualListScroll";
import TrashRow from "./TrashRow";

/** Only a first guess: rows are measured once mounted, and some have no countdown. */
const ESTIMATED_ROW_HEIGHT = 54;
const OVERSCAN_ROWS = 10;

function trashedElementId(item: TrashedElementDto) {
	return item.elementId.id;
}

interface TrashListProps {
	items: TrashedElementDto[];
	retentionDays: number;
	onDelete: (item: TrashedElementDto) => void;
}

/** Mounts only the rows near the sidebar's scroll position. */
function TrashList({ items, retentionDays, onDelete }: TrashListProps) {
	// The virtualizer changes in place, so the compiler would keep showing its first rows.
	"use no memo";

	const selected = useElementParams();
	const [root, setRoot] = useState<HTMLDivElement | null>(null);
	const { viewport, scrollMargin } = useVirtualListScroll(root);
	const { focusProps, rangeExtractor } = useFocusedRow(
		items,
		trashedElementId,
	);

	const getItemKey = useCallback(
		(index: number) => items[index].elementId.id,
		[items],
	);
	// eslint-disable-next-line react-hooks/incompatible-library -- skipped by the directive above
	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => viewport,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		overscan: OVERSCAN_ROWS,
		scrollMargin,
		getItemKey,
		rangeExtractor,
	});

	return (
		<div
			{...focusProps}
			ref={setRoot}
			style={{
				height: virtualizer.getTotalSize(),
				position: "relative",
			}}>
			{virtualizer.getVirtualItems().map(virtualItem => {
				const item = items[virtualItem.index];
				const { elementId } = item;

				return (
					<div
						key={virtualItem.key}
						ref={virtualizer.measureElement}
						data-index={virtualItem.index}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							transform: `translateY(${virtualItem.start - scrollMargin}px)`,
						}}>
						<TrashRow
							item={item}
							active={
								selected?.type === elementId.type &&
								selected?.id === elementId.id
							}
							retentionDays={retentionDays}
							onDelete={onDelete}
						/>
					</div>
				);
			})}
		</div>
	);
}

export default TrashList;
