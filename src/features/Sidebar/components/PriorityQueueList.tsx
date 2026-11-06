import { NavLink, Text } from "@mantine/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { DueElementDto } from "../../../api/study/dto/dueElementDto";
import ElementNodeIcon from "../../../components/ElementNodeIcon/ElementNodeIcon";
import { useElementParams } from "../../../hooks/useElementParams";
import { useVirtualListScroll } from "../../../hooks/useVirtualListScroll";
import { paths } from "../../../paths";
import { StudySessionLocationState } from "../../../types/study/studySessionLocationState";

const ICON_SIZE = 18;
/** Only a first guess: rows are measured once mounted, and a title may take two lines. */
const ESTIMATED_ROW_HEIGHT = 58;
const OVERSCAN_ROWS = 10;

interface PriorityQueueListProps {
	queue: DueElementDto[];
}

/** Mounts only the rows near the sidebar's scroll position. */
function PriorityQueueList({ queue }: PriorityQueueListProps) {
	// The virtualizer changes in place, so the compiler would keep showing its first rows.
	"use no memo";

	const navigate = useNavigate();
	const selected = useElementParams();
	const [root, setRoot] = useState<HTMLDivElement | null>(null);
	const { viewport, scrollMargin } = useVirtualListScroll(root);

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
	});

	return (
		<div
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
								<Text size="sm" lineClamp={2}>
									{title}
								</Text>
							}
							active={isSelected}
							styles={{
								root: { alignItems: "flex-start" },
								section: { marginTop: 2 },
								label: {
									whiteSpace: "normal",
									overflow: "visible",
								},
							}}
							leftSection={
								<ElementNodeIcon
									type={elementId.type}
									size={ICON_SIZE}
								/>
							}
							onClick={() => {
								const state: StudySessionLocationState = {
									studySessionNav: true,
								};
								void navigate(
									paths.element(elementId.type, elementId.id),
									{ state },
								);
							}}
						/>
					</div>
				);
			})}
		</div>
	);
}

export default PriorityQueueList;
