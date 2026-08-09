import { MultiSelect, Select, Stack } from "@mantine/core";
import { ElementTypeFilter } from "../../../../../api/savedSearches/dto/elementFilter";
import { ElementNodeType } from "../../../../../types/elements/elementNodeType";
import { elementTypeOptions } from "../../../utils/elementTypeOptions";
import { FILTER_EDITOR_WIDTH } from "../../../config/constants";

const operatorOptions = [
	{ value: "isAnyOf", label: "is any of" },
	{ value: "isNoneOf", label: "is none of" },
];

export default function ElementTypeFilterEditor({
	filter,
	onChange,
}: {
	filter: ElementTypeFilter;
	onChange: (filter: ElementTypeFilter) => void;
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
						operator: value as ElementTypeFilter["operator"],
					})
				}
			/>
			<MultiSelect
				placeholder="Select element types"
				data={elementTypeOptions}
				value={filter.types}
				onChange={types =>
					onChange({ ...filter, types: types as ElementNodeType[] })
				}
				withAlignedLabels
				comboboxProps={{ withinPortal: false }}
			/>
		</Stack>
	);
}
