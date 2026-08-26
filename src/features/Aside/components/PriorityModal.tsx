import { useEffect, useState } from "react";
import { NumberInput, Slider, Stack, Text } from "@mantine/core";
import AppModal from "../../../components/AppModal/AppModal";
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
import {
	formatPriorityPercentage,
	PRIORITY_PERCENTAGE_DECIMALS,
} from "../../../utils/formatPriorityPercentage";
import { PRIORITY_CHANGED } from "../../../types/events/priorityChangedEvent";
import styles from "./PriorityModal.module.css";

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

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
	const [rank, setRank] = useState(initialRank);
	const [percentage, setPercentage] = useState(initialPercentage);

	// The percentage gap between two adjacent ranks, so stepping the
	// controls below moves priority by exactly one element.
	const percentageStep = total <= 1 ? 1 : 100 / total;

	function rankToPercentage(value: number): number {
		return total <= 1 ? 0 : (value / total) * 100;
	}

	function percentageToRank(value: number): number {
		return total <= 1
			? 1
			: clamp(Math.round((value / 100) * total), 1, total);
	}

	function handleRankChange(value: string | number) {
		const newRank = clamp(Number(value) || 1, 1, total);
		setRank(newRank);
		setPercentage(rankToPercentage(newRank));
		void setElementPriorityByRank(elementId, newRank).then(() => {
			window.dispatchEvent(new Event(PRIORITY_CHANGED));
			onCommitted();
		});
	}

	function handlePercentageChange(value: string | number) {
		const newPercentage = clamp(Number(value) || 0, 0, 100);
		const newRank = percentageToRank(newPercentage);
		setRank(newRank);
		setPercentage(rankToPercentage(newRank));
		void setElementPriorityByPercentage(elementId, newPercentage).then(
			() => {
				window.dispatchEvent(new Event(PRIORITY_CHANGED));
				onCommitted();
			},
		);
	}

	function handleSliderChange(value: number) {
		setPercentage(value);
		setRank(percentageToRank(value));
	}

	return (
		<Stack gap="lg">
			<NumberInput
				label="Position"
				description={`1 (highest priority) – ${total} (lowest priority)`}
				min={1}
				max={total}
				value={rank}
				onChange={handleRankChange}
			/>
			<NumberInput
				label="Percentage"
				decimalScale={PRIORITY_PERCENTAGE_DECIMALS}
				fixedDecimalScale
				suffix="%"
				min={0}
				max={100}
				step={percentageStep}
				value={Math.round(percentage * 100) / 100}
				onChange={handlePercentageChange}
			/>
			<Stack gap={4}>
				<Slider
					value={percentage}
					min={0}
					max={100}
					step={percentageStep}
					label={formatPriorityPercentage}
					onChange={handleSliderChange}
					onChangeEnd={handlePercentageChange}
					classNames={{ track: styles["gradient-track"] }}
					styles={{
						bar: { background: "transparent" },
					}}
				/>
				<Text size="xs" c="dimmed">
					Rank {rank} of {total}
				</Text>
			</Stack>
		</Stack>
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
