import { MultiSelect, Select, Stack } from "@mantine/core";
import { BibliographicalSourceFilter } from "../../../../types/elements/elementFilter";
import { BibliographicalSourceResponseDto } from "../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { FILTER_EDITOR_WIDTH } from "../../config/constants";

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
						operator:
							value as BibliographicalSourceFilter["operator"],
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
