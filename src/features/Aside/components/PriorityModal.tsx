import { useEffect } from "react";
import { Text } from "@mantine/core";
import AppModal from "../../../components/AppModal/AppModal";
import PrioritySlider from "../../../components/PrioritySlider/PrioritySlider";
import { usePriorityControls } from "../../../components/PrioritySlider/usePriorityControls";
import {
	setElementPriorityByPercentage,
	setElementPriorityByRank,
} from "../../../api/elements/api/elementsApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { closePriorityModal } from "../../../stores/app/appReducer";
import { selectIsPriorityModalOpened } from "../../../stores/app/appSelectors";
import { loadElementDetailsAction } from "../../../stores/elementDetails/elementDetailsActions";
import { selectCurrentElementDetails } from "../../../stores/elementDetails/elementDetailsSelectors";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import { ElementId } from "../../../types/elements/elementId";
import { PRIORITY_CHANGED } from "../../../types/events/priorityChangedEvent";

interface PriorityModalBodyProps {
	elementId: ElementId;
	total: number;
	initialRank: number;
	initialPercentage: number;
	onCommitted: () => void;
}

function PriorityModalBody({
	elementId,
	total,
	initialRank,
	initialPercentage,
	onCommitted,
}: PriorityModalBodyProps) {
	const controls = usePriorityControls({
		total,
		initialRank,
		initialPercentage,
		onRankCommit: rank => {
			void setElementPriorityByRank(elementId, rank).then(() => {
				window.dispatchEvent(new Event(PRIORITY_CHANGED));
				onCommitted();
			});
		},
		onPercentageCommit: percentage => {
			void setElementPriorityByPercentage(elementId, percentage).then(
				() => {
					window.dispatchEvent(new Event(PRIORITY_CHANGED));
					onCommitted();
				},
			);
		},
	});

	return (
		<PrioritySlider
			total={total}
			rank={controls.rank}
			percentage={controls.percentage}
			percentageStep={controls.percentageStep}
			onRankChange={controls.handleRankChange}
			onPercentageChange={controls.handlePercentageChange}
			onSliderChange={controls.handleSliderChange}
			onSliderChangeEnd={controls.handleSliderChangeEnd}
		/>
	);
}

function PriorityModal() {
	const opened = useAppSelector(selectIsPriorityModalOpened);
	const currentElement = useAppSelector(selectCurrentElement);
	const details = useAppSelector(selectCurrentElementDetails);
	const dispatch = useAppDispatch();
	const elementId = currentElement?.data.meta.elementId ?? null;

	useEffect(() => {
		if (!opened || !elementId) return;
		void dispatch(loadElementDetailsAction(elementId));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [opened, elementId]);

	return (
		<AppModal
			opened={opened}
			onClose={() => dispatch(closePriorityModal())}
			title="Priority">
			{elementId && details ? (
				<PriorityModalBody
					key={`${elementId.id}-${details.priority.rank}-${details.priority.total}`}
					elementId={elementId}
					total={details.priority.total}
					initialRank={details.priority.rank}
					initialPercentage={details.priority.percentage}
					onCommitted={() =>
						void dispatch(loadElementDetailsAction(elementId))
					}
				/>
			) : (
				<Text size="sm" c="dimmed">
					Loading…
				</Text>
			)}
		</AppModal>
	);
}

export default PriorityModal;
