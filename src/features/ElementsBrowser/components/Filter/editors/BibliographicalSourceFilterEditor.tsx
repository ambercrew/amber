import { MultiSelect, Stack } from "@mantine/core";
import { BibliographicalSourceFilter } from "../../../../../api/savedSearches/dto/elementFilter";
import { BibliographicalSourceResponseDto } from "../../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { FILTER_EDITOR_WIDTH } from "../../../config/constants";
import FilterOperatorSelect from "./FilterOperatorSelect";

const operatorOptions = [
	{ value: "isAnyOf", label: "is any of" },
	{ value: "isNoneOf", label: "is none of" },
];

export default function BibliographicalSourceFilterEditor({
	filter,
	sources,
	onChange,
}: {
	filter: BibliographicalSourceFilter;
	sources: BibliographicalSourceResponseDto[];
	onChange: (filter: BibliographicalSourceFilter) => void;
}) {
	return (
		<Stack gap="xs" w={FILTER_EDITOR_WIDTH}>
			<FilterOperatorSelect
				options={operatorOptions}
				value={filter.operator}
				onChange={operator =>
					onChange({
						...filter,
						operator:
							operator as BibliographicalSourceFilter["operator"],
					})
				}
			/>
			<MultiSelect
				placeholder="Select bibliographical sources"
				searchable
				data={sources.map(source => ({
					value: source.id,
					label: source.title,
				}))}
				value={filter.sourceIds}
				onChange={sourceIds => onChange({ ...filter, sourceIds })}
				withAlignedLabels
				comboboxProps={{ withinPortal: false }}
			/>
		</Stack>
	);
}
