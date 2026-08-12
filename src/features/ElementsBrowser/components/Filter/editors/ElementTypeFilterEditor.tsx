import { MultiSelect, Stack } from "@mantine/core";
import { ElementTypeFilter } from "../../../../../api/savedSearches/dto/elementFilter";
import { ElementNodeType } from "../../../../../types/elements/elementNodeType";
import { elementTypeOptions } from "../../../utils/elementTypeOptions";
import { FILTER_EDITOR_WIDTH } from "../../../config/constants";
import FilterOperatorSelect from "./FilterOperatorSelect";

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
			<FilterOperatorSelect
				options={operatorOptions}
				value={filter.operator}
				onChange={operator =>
					onChange({
						...filter,
						operator: operator as ElementTypeFilter["operator"],
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
