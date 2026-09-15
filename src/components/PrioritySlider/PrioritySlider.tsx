import { NumberInput, Slider, Stack, Text } from "@mantine/core";
import {
	formatPriorityPercentile,
	PRIORITY_PERCENTILE_DECIMALS,
} from "../../utils/formatPriorityPercentile";
import styles from "./PrioritySlider.module.css";

interface PrioritySliderProps {
	total: number;
	rank: number;
	percentile: number;
	percentileStep: number;
	onRankChange: (value: string | number) => void;
	onPercentileChange: (value: string | number) => void;
	onSliderChange: (value: number) => void;
	onSliderChangeEnd: (value: number) => void;
}

/** Position + percentile inputs paired with a priority slider, shared between
 * `PriorityModal` (repositions an existing element) and the import priority
 * section (chooses where a new element will land). */
function PrioritySlider({
	total,
	rank,
	percentile,
	percentileStep,
	onRankChange,
	onPercentileChange,
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
				label="Rank"
				decimalScale={PRIORITY_PERCENTILE_DECIMALS}
				fixedDecimalScale
				suffix="%"
				min={0}
				max={100}
				step={percentileStep}
				value={Math.round(percentile * 100) / 100}
				onChange={onPercentileChange}
			/>
			<Stack gap={4} style={{ overflowX: "clip" }}>
				<Slider
					value={percentile}
					min={0}
					max={100}
					step={percentileStep}
					label={formatPriorityPercentile}
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
