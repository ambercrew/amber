import { MultiSelect, Select, Stack } from "@mantine/core";
import { StudyProfileFilter } from "../../../../types/elements/elementFilter";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";
import { FILTER_EDITOR_WIDTH } from "../../config/constants";

const operatorOptions = [
	{ value: "isAnyOf", label: "is any of" },
	{ value: "isNoneOf", label: "is none of" },
];

export default function StudyProfileFilterEditor({
	filter,
	profiles,
	onChange,
}: {
	filter: StudyProfileFilter;
	profiles: StudyProfileDto[];
	onChange: (filter: StudyProfileFilter) => void;
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
						operator: value as StudyProfileFilter["operator"],
					})
				}
			/>
			<MultiSelect
				placeholder="Select study profiles"
				searchable
				data={profiles.map(profile => ({
					value: profile.id,
					label: profile.name,
				}))}
				value={filter.profileIds}
				onChange={profileIds => onChange({ ...filter, profileIds })}
				withAlignedLabels
				comboboxProps={{ withinPortal: false }}
			/>
		</Stack>
	);
}
