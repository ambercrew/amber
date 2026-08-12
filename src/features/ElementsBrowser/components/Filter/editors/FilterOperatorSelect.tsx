import { Select } from "@mantine/core";

interface FilterOperatorSelectProps {
	options: { value: string; label: string }[];
	value: string;
	onChange: (value: string) => void;
}

export default function FilterOperatorSelect({
	options,
	value,
	onChange,
}: FilterOperatorSelectProps) {
	return (
		<Select
			data={options}
			value={value}
			allowDeselect={false}
			withAlignedLabels
			comboboxProps={{ withinPortal: false }}
			onChange={next => next && onChange(next)}
		/>
	);
}
