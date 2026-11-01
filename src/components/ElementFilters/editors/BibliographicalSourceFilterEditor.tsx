import { BibliographicalSourceFilter } from "../../../api/savedSearches/dto/elementFilter";
import { BibliographicalSourceResponseDto } from "../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import SelectFilterEditor from "./SelectFilterEditor";

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
		<SelectFilterEditor
			operator={filter.operator}
			values={filter.sourceIds}
			data={sources.map(source => ({
				value: source.id,
				label: source.title,
			}))}
			placeholder="Select bibliographical sources"
			searchable
			onChange={(operator, sourceIds) =>
				onChange({ ...filter, operator, sourceIds })
			}
		/>
	);
}
