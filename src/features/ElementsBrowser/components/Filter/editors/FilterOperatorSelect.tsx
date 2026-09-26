import { Select } from "@mantine/core";

interface FilterOperatorSelectProps {
	options: { value: string; label: string }[];
	value: string;
	onChange: (value: string) => void;
	/** Marks this as the field a focus-trapping popover focuses on open. */
	autoFocus?: boolean;
}

export default function FilterOperatorSelect({
	options,
	value,
	onChange,
	autoFocus,
}: FilterOperatorSelectProps) {
	return (
		<Select
			data={options}
			value={value}
			allowDeselect={false}
			data-autofocus={autoFocus ? true : undefined}
			withAlignedLabels
			comboboxProps={{ withinPortal: false }}
			onChange={next => next && onChange(next)}
		/>
	);
}
