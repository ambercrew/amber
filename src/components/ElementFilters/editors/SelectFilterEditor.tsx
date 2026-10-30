import { MultiSelect, Stack } from "@mantine/core";
import { SelectFilterOperator } from "../../../api/savedSearches/dto/elementFilter";
import { FILTER_EDITOR_WIDTH } from "../constants";
import { selectOperatorLabels } from "../utils/filterDisplay";
import FilterOperatorSelect from "./FilterOperatorSelect";

const operatorOptions = Object.entries(selectOperatorLabels).map(
	([value, label]) => ({ value, label }),
);

/** Shared editor for the "is any of / is none of" + multi-select filters. */
export default function SelectFilterEditor<T extends string>({
	operator,
	values,
	data,
	placeholder,
	searchable,
	onChange,
}: {
	operator: SelectFilterOperator;
	values: T[];
	data: { value: T; label: string }[];
	placeholder: string;
	searchable?: boolean;
	onChange: (operator: SelectFilterOperator, values: T[]) => void;
}) {
	return (
		<Stack gap="xs" w={FILTER_EDITOR_WIDTH}>
			<FilterOperatorSelect
				options={operatorOptions}
				value={operator}
				onChange={next =>
					onChange(next as SelectFilterOperator, values)
				}
			/>
			<MultiSelect
				placeholder={placeholder}
				data-autofocus
				searchable={searchable}
				data={data}
				value={values}
				onChange={next => onChange(operator, next as T[])}
				withAlignedLabels
				comboboxProps={{ withinPortal: false }}
			/>
		</Stack>
	);
}
