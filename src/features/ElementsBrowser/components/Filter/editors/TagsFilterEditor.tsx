import { Select, Stack, TagsInput } from "@mantine/core";
import { TagsFilter } from "../../../../../api/savedSearches/dto/elementFilter";
import { FILTER_EDITOR_WIDTH } from "../../../config/constants";

const operatorOptions = [
	{ value: "isAnyOf", label: "is any of" },
	{ value: "isAllOf", label: "is all of" },
	{ value: "isNoneOf", label: "is none of" },
];

export default function TagsFilterEditor({
	filter,
	onChange,
}: {
	filter: TagsFilter;
	onChange: (filter: TagsFilter) => void;
}) {
	return (
		<Stack gap="xs" w={FILTER_EDITOR_WIDTH}>
			<Select
				data={operatorOptions}
				value={filter.operator}
				allowDeselect={false}
				withAlignedLabels
				comboboxProps={{ withinPortal: false }}
				onChange={value =>
					value &&
					onChange({
						...filter,
						operator: value as TagsFilter["operator"],
					})
				}
			/>
			<TagsInput
				placeholder="Add tags"
				value={filter.tags}
				onChange={tags => onChange({ ...filter, tags })}
			/>
		</Stack>
	);
}
