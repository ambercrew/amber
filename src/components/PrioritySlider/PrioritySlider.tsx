import { NumberInput, Slider, Stack, Text } from "@mantine/core";
import {
	formatPriorityRank,
	PRIORITY_RANK_DECIMALS,
} from "../../utils/formatPriorityRank";
import styles from "./PrioritySlider.module.css";

interface PrioritySliderProps {
	total: number;
	position: number;
	rank: number;
	rankStep: number;
	onPositionChange: (value: string | number) => void;
	onRankChange: (value: string | number) => void;
	onSliderChange: (value: number) => void;
	onSliderChangeEnd: (value: number) => void;
}

/** Position + rank inputs paired with a priority slider, shared between
 * `PriorityModal` (repositions an existing element) and the import priority
 * section (chooses where a new element will land). */
function PrioritySlider({
	total,
	position,
	rank,
	rankStep,
	onPositionChange,
	onRankChange,
	onSliderChange,
	onSliderChangeEnd,
}: PrioritySliderProps) {
	return (
		<Stack gap="lg">
			<NumberInput
				label="Position"
				description={`1 (highest priority) – ${total} (lowest priority)`}
				min={1}
				max={total}
				value={position}
				onChange={onPositionChange}
			/>
			<NumberInput
				label="Rank"
				decimalScale={PRIORITY_RANK_DECIMALS}
				fixedDecimalScale
				suffix="%"
				min={0}
				max={100}
				step={rankStep}
				value={Math.round(rank * 100) / 100}
				onChange={onRankChange}
			/>
			<Stack gap={4} style={{ overflowX: "clip" }}>
				<Slider
					value={rank}
					min={0}
					max={100}
					step={rankStep}
					label={formatPriorityRank}
					onChange={onSliderChange}
					onChangeEnd={onSliderChangeEnd}
					classNames={{ track: styles["gradient-track"] }}
					styles={{
						bar: { background: "transparent" },
					}}
				/>
				<Text size="xs" c="dimmed">
					Position {position} of {total}
				</Text>
			</Stack>
		</Stack>
	);
}

export default PrioritySlider;
