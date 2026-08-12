import { Stack, TextInput } from "@mantine/core";
import { NameFilter } from "../../../../../api/savedSearches/dto/elementFilter";
import { FILTER_EDITOR_WIDTH } from "../../../config/constants";
import FilterOperatorSelect from "./FilterOperatorSelect";

const operatorOptions = [
	{ value: "contains", label: "contains" },
	{ value: "equals", label: "equals" },
	{ value: "startsWith", label: "starts with" },
	{ value: "endsWith", label: "ends with" },
];

export default function NameFilterEditor({
	filter,
	onChange,
}: {
	filter: NameFilter;
	onChange: (filter: NameFilter) => void;
}) {
	return (
		<Stack gap="xs" w={FILTER_EDITOR_WIDTH}>
			<FilterOperatorSelect
				options={operatorOptions}
				value={filter.operator}
				onChange={operator =>
					onChange({
						...filter,
						operator: operator as NameFilter["operator"],
					})
				}
			/>
			<TextInput
				placeholder="Name"
				value={filter.value}
				onChange={event =>
					onChange({ ...filter, value: event.currentTarget.value })
				}
			/>
		</Stack>
	);
}
