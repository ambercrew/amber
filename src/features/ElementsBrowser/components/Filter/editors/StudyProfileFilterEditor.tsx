import { MultiSelect, Stack } from "@mantine/core";
import { StudyProfileFilter } from "../../../../../api/savedSearches/dto/elementFilter";
import { StudyProfileDto } from "../../../../../api/study/dto/studyProfileDto";
import { FILTER_EDITOR_WIDTH } from "../../../config/constants";
import FilterOperatorSelect from "./FilterOperatorSelect";

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
			<FilterOperatorSelect
				options={operatorOptions}
				value={filter.operator}
				onChange={operator =>
					onChange({
						...filter,
						operator: operator as StudyProfileFilter["operator"],
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
