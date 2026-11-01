import { useState } from "react";
import { Group } from "@mantine/core";
import {
	ElementFilter,
	ElementFilterField,
} from "../../api/savedSearches/dto/elementFilter";
import { BibliographicalSourceResponseDto } from "../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { StudyProfileDto } from "../../api/study/dto/studyProfileDto";
import { createDefaultFilter } from "./utils/createDefaultFilter";
import FilterChip from "./FilterChip";
import AddFilterMenu from "./AddFilterMenu";

/** Editable row of element filter chips, plus a menu to add another. */
export default function ElementFilters({
	filters,
	onChange,
	sources,
	profiles,
}: {
	filters: ElementFilter[];
	onChange: (filters: ElementFilter[]) => void;
	sources: BibliographicalSourceResponseDto[];
	profiles: StudyProfileDto[];
}) {
	const [justAddedId, setJustAddedId] = useState<string | null>(null);

	function handleAdd(field: ElementFilterField) {
		const filter = createDefaultFilter(field);
		onChange([...filters, filter]);
		setJustAddedId(filter.id);
	}

	function handleChange(updated: ElementFilter) {
		onChange(filters.map(f => (f.id === updated.id ? updated : f)));
	}

	function handleRemove(id: string) {
		onChange(filters.filter(f => f.id !== id));
	}

	return (
		<Group gap="xs" wrap="wrap">
			{filters.map(filter => (
				<FilterChip
					key={filter.id}
					filter={filter}
					sources={sources}
					profiles={profiles}
					defaultOpened={filter.id === justAddedId}
					onChange={handleChange}
					onRemove={() => handleRemove(filter.id)}
				/>
			))}
			<AddFilterMenu onSelect={handleAdd} />
		</Group>
	);
}
