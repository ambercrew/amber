import { Select, Stack, TextInput } from "@mantine/core";
import { NameFilter } from "../../../../api/savedSearches/dto/elementFilter";
import { FILTER_EDITOR_WIDTH } from "../../config/constants";

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
						operator: value as NameFilter["operator"],
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
