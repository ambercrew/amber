import { ComponentProps } from "react";
import { RangeSlider, Stack, Text } from "@mantine/core";
import { PriorityFilter } from "../../../../../api/savedSearches/dto/elementFilter";
import { FILTER_EDITOR_WIDTH } from "../../../config/constants";
import {
	formatPriorityPercentile,
	formatPriorityPercentileRange,
} from "../../../../../utils/formatPriorityPercentile";

// Data attributes aren't in the div props type, so the object needs a cast.
const AUTOFOCUS_THUMB = { "data-autofocus": true } as ComponentProps<"div">;

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
				Priority {formatPriorityPercentileRange(filter.min, filter.max)}
			</Text>
			<RangeSlider
				min={0}
				max={100}
				minRange={1}
				value={[filter.min, filter.max]}
				onChange={([min, max]) => onChange({ ...filter, min, max })}
				label={formatPriorityPercentile}
				thumbProps={index => (index === 0 ? AUTOFOCUS_THUMB : {})}
			/>
		</Stack>
	);
}
