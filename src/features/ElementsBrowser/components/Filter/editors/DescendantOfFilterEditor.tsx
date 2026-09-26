import { Stack } from "@mantine/core";
import { DescendantOfFilter } from "../../../../../api/savedSearches/dto/elementFilter";
import ElementSelect from "../../../../../components/ElementSelect/ElementSelect";
import { FILTER_EDITOR_WIDTH } from "../../../config/constants";
import { descendantOperatorLabels } from "../../../utils/filterDisplay";
import FilterOperatorSelect from "./FilterOperatorSelect";

const operatorOptions = Object.entries(descendantOperatorLabels).map(
	([value, label]) => ({ value, label }),
);

export default function DescendantOfFilterEditor({
	filter,
	onChange,
}: {
	filter: DescendantOfFilter;
	onChange: (filter: DescendantOfFilter) => void;
}) {
	return (
		<Stack gap="xs" w={FILTER_EDITOR_WIDTH}>
			<FilterOperatorSelect
				options={operatorOptions}
				value={filter.operator}
				onChange={operator =>
					onChange({
						...filter,
						operator: operator as DescendantOfFilter["operator"],
					})
				}
			/>
			<ElementSelect
				placeholder="Search for an element"
				value={filter.ancestor}
				onChange={ancestor => onChange({ ...filter, ancestor })}
				autoFocus
				comboboxProps={{ withinPortal: false }}
			/>
		</Stack>
	);
}
