import { NumberInput, Select, Stack } from "@mantine/core";
import { DateInput, DatePickerInput } from "@mantine/dates";
import { DateFilter } from "../../../../../api/savedSearches/dto/elementFilter";
import { FILTER_EDITOR_WIDTH } from "../../../config/constants";

const operatorOptions = [
	{ value: "today", label: "today" },
	{ value: "withinDays", label: "within" },
	{ value: "before", label: "before" },
	{ value: "after", label: "after" },
	{ value: "between", label: "between" },
];

export default function DateFilterEditor({
	filter,
	onChange,
}: {
	filter: DateFilter;
	onChange: (filter: DateFilter) => void;
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
						operator: value as DateFilter["operator"],
					})
				}
			/>
			{filter.operator === "withinDays" && (
				<NumberInput
					label="Days"
					min={1}
					value={filter.days ?? 1}
					onChange={value =>
						onChange({ ...filter, days: Number(value) || 1 })
					}
				/>
			)}
			{(filter.operator === "before" || filter.operator === "after") && (
				<DateInput
					label="Date"
					value={filter.from}
					onChange={value => onChange({ ...filter, from: value })}
					popoverProps={{ withinPortal: false }}
				/>
			)}
			{filter.operator === "between" && (
				<DatePickerInput
					type="range"
					label="Date range"
					value={[filter.from, filter.to]}
					onChange={([from, to]) => onChange({ ...filter, from, to })}
					popoverProps={{ withinPortal: false }}
				/>
			)}
		</Stack>
	);
}
