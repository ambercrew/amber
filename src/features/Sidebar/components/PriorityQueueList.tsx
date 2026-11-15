import { NavLink, Text } from "@mantine/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { DueElementDto } from "../../../api/study/dto/dueElementDto";
import ElementNodeIcon from "../../../components/ElementNodeIcon/ElementNodeIcon";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { useElementParams } from "../../../hooks/useElementParams";
import { useFocusedRow } from "../../../hooks/useFocusedRow";
import { useVirtualListScroll } from "../../../hooks/useVirtualListScroll";
import { paths } from "../../../paths";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectStudyReviewedElement } from "../../../stores/study/studySelectors";
import { REVIEW_NAVIGATION_STATE } from "../../../types/study/reviewNavigationState";

const ICON_SIZE = 18;
/** Only a first guess: rows are measured once mounted. */
const ESTIMATED_ROW_HEIGHT = 38;
const OVERSCAN_ROWS = 10;

function dueElementId(element: DueElementDto) {
	return element.elementId.id;
}

interface PriorityQueueListProps {
	queue: DueElementDto[];
}

/** Mounts only the rows near the sidebar's scroll position. */
function PriorityQueueList({ queue }: PriorityQueueListProps) {
	// The virtualizer changes in place, so the compiler would keep showing its first rows.
	"use no memo";

	const navigate = useNavigate();
	// In a session, the element under review, whatever page is open.
	const reviewed = useAppSelector(selectStudyReviewedElement);
	const openElement = useElementParams();
	const selected = reviewed ?? openElement;
	const [root, setRoot] = useState<HTMLDivElement | null>(null);
	const { viewport, scrollMargin } = useVirtualListScroll(root);
	const { focusProps, rangeExtractor } = useFocusedRow(queue, dueElementId);

	const getItemKey = useCallback(
		(index: number) => queue[index].elementId.id,
		[queue],
	);
	// eslint-disable-next-line react-hooks/incompatible-library -- skipped by the directive above
	const virtualizer = useVirtualizer({
		count: queue.length,
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
			{virtualizer.getVirtualItems().map(item => {
				const { elementId, title } = queue[item.index];
				const isSelected =
					selected?.type === elementId.type &&
					selected?.id === elementId.id;

				return (
					<div
						key={item.key}
						ref={virtualizer.measureElement}
						data-index={item.index}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							transform: `translateY(${item.start - scrollMargin}px)`,
						}}>
						<NavLink
							label={
								<AppTooltip label={title} multiline maw={320}>
									<Text size="sm" truncate="end">
										{title}
									</Text>
								</AppTooltip>
							}
							active={isSelected}
							leftSection={
								<ElementNodeIcon
									type={elementId.type}
									size={ICON_SIZE}
								/>
							}
							onClick={() =>
								void navigate(
									paths.element(elementId.type, elementId.id),
									{ state: REVIEW_NAVIGATION_STATE },
								)
							}
						/>
					</div>
				);
			})}
		</div>
	);
}

export default PriorityQueueList;
