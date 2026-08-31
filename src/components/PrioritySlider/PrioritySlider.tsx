import { NumberInput, Slider, Stack, Text } from "@mantine/core";
import {
	formatPriorityPercentage,
	PRIORITY_PERCENTAGE_DECIMALS,
} from "../../utils/formatPriorityPercentage";
import styles from "./PrioritySlider.module.css";

interface PrioritySliderProps {
	total: number;
	rank: number;
	percentage: number;
	percentageStep: number;
	onRankChange: (value: string | number) => void;
	onPercentageChange: (value: string | number) => void;
	onSliderChange: (value: number) => void;
	onSliderChangeEnd: (value: number) => void;
}

/** Position + percentage inputs paired with a priority slider, shared between
 * `PriorityModal` (repositions an existing element) and the import priority
 * section (chooses where a new element will land). */
function PrioritySlider({
	total,
	rank,
	percentage,
	percentageStep,
	onRankChange,
	onPercentageChange,
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
				value={rank}
				onChange={onRankChange}
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
				onChange={onPercentageChange}
			/>
			<Stack gap={4} style={{ overflowX: "clip" }}>
				<Slider
					value={percentage}
					min={0}
					max={100}
					step={percentageStep}
					label={formatPriorityPercentage}
					onChange={onSliderChange}
					onChangeEnd={onSliderChangeEnd}
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

export default PrioritySlider;
