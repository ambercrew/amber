import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Group, Paper, Stack } from "@mantine/core";
import {
	ElementFilter,
	ElementFilterField,
} from "../../../api/savedSearches/dto/elementFilter";
import { ElementsBrowserLocationState } from "../../../types/elements/elementsBrowserLocationState";
import { BibliographicalSourceResponseDto } from "../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { listBibliographicalSources } from "../../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import { listStudyProfiles } from "../../../api/study/api/studyProfileApi";
import { SavedSearchResponseDto } from "../../../api/savedSearches/dto/savedSearchResponseDto";
import { listSavedSearches } from "../../../api/savedSearches/api/savedSearchesApi";
import { createDefaultFilter } from "../utils/createDefaultFilter";
import FilterChip from "./Filter/FilterChip";
import AddFilterMenu from "./Filter/AddFilterMenu";
import SavedSearchSelector from "./SavedSearch/SavedSearchSelector";

export default function ElementsBrowser() {
	const location = useLocation();
	const navigate = useNavigate();
	const locationState = location.state as ElementsBrowserLocationState | null;

	const [filters, setFilters] = useState<ElementFilter[]>(
		locationState?.elementsBrowser?.filters ?? [],
	);
	const [loadedSavedSearchId, setLoadedSavedSearchId] = useState<
		string | null
	>(locationState?.elementsBrowser?.loadedSavedSearchId ?? null);
	const [justAddedId, setJustAddedId] = useState<string | null>(null);

	const [sources, setSources] = useState<BibliographicalSourceResponseDto[]>(
		[],
	);
	const [profiles, setProfiles] = useState<StudyProfileDto[]>([]);
	const [savedSearches, setSavedSearches] = useState<
		SavedSearchResponseDto[]
	>([]);

	useEffect(() => {
		void listBibliographicalSources().then(setSources);
		void listStudyProfiles().then(setProfiles);
		void listSavedSearches().then(setSavedSearches);
	}, []);

	useEffect(() => {
		void navigate(location.pathname, {
			replace: true,
			state: { elementsBrowser: { filters, loadedSavedSearchId } },
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filters, loadedSavedSearchId]);

	function handleAddFilter(field: ElementFilterField) {
		const filter = createDefaultFilter(field);
		setFilters(current => [...current, filter]);
		setJustAddedId(filter.id);
	}

	function handleChangeFilter(updated: ElementFilter) {
		setFilters(current =>
			current.map(f => (f.id === updated.id ? updated : f)),
		);
	}

	function handleRemoveFilter(id: string) {
		setFilters(current => current.filter(f => f.id !== id));
	}

	return (
		<Paper withBorder radius="md" p="md" maw={900} mx="auto" mt="lg">
			<Stack gap="sm">
				<SavedSearchSelector
					filters={filters}
					onFiltersChange={setFilters}
					loadedSavedSearchId={loadedSavedSearchId}
					onLoadedSavedSearchIdChange={setLoadedSavedSearchId}
					savedSearches={savedSearches}
					onSavedSearchesChange={setSavedSearches}
				/>
				<Group gap="xs" wrap="wrap">
					{filters.map(filter => (
						<FilterChip
							key={filter.id}
							filter={filter}
							sources={sources}
							profiles={profiles}
							defaultOpened={filter.id === justAddedId}
							onChange={handleChangeFilter}
							onRemove={() => handleRemoveFilter(filter.id)}
						/>
					))}
					<AddFilterMenu onSelect={handleAddFilter} />
				</Group>
			</Stack>
		</Paper>
	);
}
