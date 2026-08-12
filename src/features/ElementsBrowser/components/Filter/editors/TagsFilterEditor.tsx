import { Stack, TagsInput } from "@mantine/core";
import { TagsFilter } from "../../../../../api/savedSearches/dto/elementFilter";
import { FILTER_EDITOR_WIDTH } from "../../../config/constants";
import FilterOperatorSelect from "./FilterOperatorSelect";

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
			<FilterOperatorSelect
				options={operatorOptions}
				value={filter.operator}
				onChange={operator =>
					onChange({
						...filter,
						operator: operator as TagsFilter["operator"],
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
