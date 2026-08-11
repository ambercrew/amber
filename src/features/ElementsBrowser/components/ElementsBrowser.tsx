import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useDebouncedValue } from "@mantine/hooks";
import { Group, Paper, Stack, Text, Title } from "@mantine/core";
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
import { searchElements } from "../../../api/search/api/searchApi";
import { SearchElementResultDto } from "../../../api/search/dto/searchElementResultDto";
import { ElementId } from "../../../types/elements/elementId";
import useApi from "../../../hooks/useApi";
import { SEARCH_DEBOUNCE_MS } from "../config/constants";
import { createDefaultFilter } from "../utils/createDefaultFilter";
import { elementKey } from "../utils/elementKey";
import FilterChip from "./Filter/FilterChip";
import AddFilterMenu from "./Filter/AddFilterMenu";
import SavedSearchSelector from "./SavedSearch/SavedSearchSelector";
import SearchResultsTable from "./SearchResultsTable";
import BulkActionsBar from "./BulkActions/BulkActionsBar";

// TODO: add unit tests to bulk operations
// TODO: mark as finished should just say for extracts/learning assets
// TODO: reset is wrong, it is only applicaable to cards
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
	const [results, setResults] = useState<SearchElementResultDto[]>([]);
	const [selectedIds, setSelectedIds] = useState<ElementId[]>(
		locationState?.elementsBrowser?.selectedIds ?? [],
	);
	const { callApi } = useApi();
	const [debouncedFilters] = useDebouncedValue(filters, SEARCH_DEBOUNCE_MS);

	useEffect(() => {
		void listBibliographicalSources().then(setSources);
		void listStudyProfiles().then(setProfiles);
		void listSavedSearches().then(setSavedSearches);
	}, []);

	function runSearch() {
		void callApi(() => searchElements({ filters: debouncedFilters })).then(
			searchResults => {
				if (searchResults) setResults(searchResults);
			},
		);
	}

	useEffect(() => {
		runSearch();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedFilters]);

	function updateFilters(next: ElementFilter[]) {
		setFilters(next);
		setSelectedIds([]);
	}

	useEffect(() => {
		void navigate(location.pathname, {
			replace: true,
			state: {
				elementsBrowser: { filters, loadedSavedSearchId, selectedIds },
			},
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filters, loadedSavedSearchId, selectedIds]);

	function handleAddFilter(field: ElementFilterField) {
		const filter = createDefaultFilter(field);
		updateFilters([...filters, filter]);
		setJustAddedId(filter.id);
	}

	function handleChangeFilter(updated: ElementFilter) {
		updateFilters(filters.map(f => (f.id === updated.id ? updated : f)));
	}

	function handleRemoveFilter(id: string) {
		updateFilters(filters.filter(f => f.id !== id));
	}

	const selectedKeys = new Set(selectedIds.map(elementKey));
	const selectedResults = results.filter(r =>
		selectedKeys.has(elementKey(r)),
	);

	return (
		<Paper withBorder radius="md" p="md" maw={900} mx="auto" mt="lg">
			<Stack gap="sm">
				<Stack gap={2}>
					<Title order={2}>Browser</Title>
					<Text c="dimmed" size="sm">
						Search and filter every element in your collection. Save
						the queries you use often, and select results to act on
						them in bulk.
					</Text>
				</Stack>
				<SavedSearchSelector
					filters={filters}
					onFiltersChange={updateFilters}
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
				<BulkActionsBar
					selectedIds={selectedIds}
					selectedResults={selectedResults}
					profiles={profiles}
					sources={sources}
					onClearSelection={() => setSelectedIds([])}
					onActionComplete={runSearch}
				/>
				<SearchResultsTable
					results={results}
					selectedIds={selectedIds}
					onSelectionChange={setSelectedIds}
				/>
			</Stack>
		</Paper>
	);
}
