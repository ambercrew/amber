import { RangeSlider, Stack, Text } from "@mantine/core";
import { PriorityFilter } from "../../../../api/savedSearches/dto/elementFilter";
import { FILTER_EDITOR_WIDTH } from "../../config/constants";

export default function PriorityFilterEditor({
	filter,
	onChange,
}: {
	filter: PriorityFilter;
	onChange: (filter: PriorityFilter) => void;
}) {
	return (
		<Stack gap="xs" w={FILTER_EDITOR_WIDTH}>
			<Text size="sm" c="dimmed">
				Priority {filter.min}–{filter.max}%
			</Text>
			<RangeSlider
				min={0}
				max={100}
				minRange={1}
				value={[filter.min, filter.max]}
				onChange={([min, max]) => onChange({ ...filter, min, max })}
				label={value => `${value}%`}
			/>
		</Stack>
	);
}
