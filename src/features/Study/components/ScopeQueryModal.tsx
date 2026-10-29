import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import {
	Alert,
	Button,
	Group,
	ScrollArea,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import AppModal from "../../../components/AppModal/AppModal";
import ElementFilters from "../../../components/ElementFilters/ElementFilters";
import { SEARCH_DEBOUNCE_MS } from "../../../components/ElementFilters/constants";
import SearchResultsTable from "../../../components/SearchResultsTable/SearchResultsTable";
import { searchElements } from "../../../api/search/api/searchApi";
import { SearchElementResultDto } from "../../../api/search/dto/searchElementResultDto";
import { SearchSortDto } from "../../../api/search/dto/searchSortDto";
import { ElementFilter } from "../../../api/savedSearches/dto/elementFilter";
import { createSavedSearch } from "../../../api/savedSearches/api/savedSearchesApi";
import { SavedSearchResponseDto } from "../../../api/savedSearches/dto/savedSearchResponseDto";
import { listBibliographicalSources } from "../../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import { BibliographicalSourceResponseDto } from "../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { listStudyProfiles } from "../../../api/study/api/studyProfileApi";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import useApi from "../../../hooks/useApi";
import { toSavedSearchFilterDtos } from "../../../utils/savedSearchFilterDto";
import { DEFAULT_SEARCH_SORT } from "../../../utils/searchSort";
import { useRecentCustomQueries } from "../hooks/useRecentCustomQueries";

/**
 * Builds a study scope query, used as is or saved as a search first.
 * Remount it (via `key`) to start from new `initialFilters`.
 */
export default function ScopeQueryModal({
	opened,
	initialFilters,
	onClose,
	onUseCustom,
	onCreated,
}: {
	opened: boolean;
	initialFilters: ElementFilter[];
	onClose: () => void;
	onUseCustom: (filters: ElementFilter[]) => void;
	onCreated: (savedSearch: SavedSearchResponseDto) => void;
}) {
	// One per action, so a failed search never reads as a failed save.
	const { callApi: callLoadApi, errorMessage: loadError } = useApi();
	const { callApi: callSearchApi, errorMessage: searchError } = useApi();
	const {
		callApi: callSaveApi,
		errorMessage: saveError,
		isSendingRequest: isSaving,
	} = useApi();
	const { remember } = useRecentCustomQueries();
	const [name, setName] = useState("");
	const [filters, setFilters] = useState<ElementFilter[]>(initialFilters);
	const [sources, setSources] = useState<BibliographicalSourceResponseDto[]>(
		[],
	);
	const [profiles, setProfiles] = useState<StudyProfileDto[]>([]);
	const [sort, setSort] = useState<SearchSortDto>(DEFAULT_SEARCH_SORT);
	const [results, setResults] = useState<SearchElementResultDto[]>([]);
	const [debouncedFilters] = useDebouncedValue(filters, SEARCH_DEBOUNCE_MS);
	// Searches can resolve out of order; only the latest may publish results.
	const latestSearchId = useRef(0);

	useEffect(() => {
		if (!opened) return;
		void callLoadApi(async () => {
			const [loadedSources, loadedProfiles] = await Promise.all([
				listBibliographicalSources(),
				listStudyProfiles(),
			]);
			setSources(loadedSources);
			setProfiles(loadedProfiles);
		});
	}, [opened, callLoadApi]);

	useEffect(() => {
		if (!opened) return;
		const searchId = ++latestSearchId.current;
		void callSearchApi(() =>
			searchElements({ filters: debouncedFilters, sort }),
		).then(found => {
			if (found && searchId === latestSearchId.current) {
				setResults(found);
			}
		});
	}, [opened, debouncedFilters, sort, callSearchApi]);

	function handleUseCustom() {
		remember(filters);
		onUseCustom(filters);
		onClose();
	}

	function handleSave() {
		const trimmed = name.trim();
		if (!trimmed) return;
		void callSaveApi(async () => {
			return createSavedSearch({
				name: trimmed,
				filters: toSavedSearchFilterDtos(filters),
				sort,
			});
		}).then(savedSearch => {
			if (!savedSearch) return;
			onCreated(savedSearch);
			onClose();
		});
	}

	return (
		<AppModal
			opened={opened}
			onClose={onClose}
			title="Study query"
			size="xl"
			fullScreenOnSmallScreen>
			<Stack gap="md">
				<TextInput
					label="Name"
					description="Only needed to save the query as a search."
					placeholder="Search name"
					data-autofocus
					value={name}
					onChange={event => setName(event.currentTarget.value)}
				/>
				<Stack gap={4}>
					<Text size="sm" fw={500}>
						Filters
					</Text>
					<Text size="xs" c="dimmed">
						Only due elements matching every filter are studied.
					</Text>
					<ElementFilters
						filters={filters}
						onChange={setFilters}
						sources={sources}
						profiles={profiles}
					/>
					{loadError && (
						<Alert
							color="red"
							title="Couldn't load the filter options">
							{loadError}
						</Alert>
					)}
				</Stack>
				<Stack gap={4}>
					<Text size="sm" fw={500}>
						Matching elements ({results.length})
					</Text>
					<ScrollArea.Autosize mah={320}>
						<SearchResultsTable
							results={results}
							sort={sort}
							onSortChange={setSort}
						/>
					</ScrollArea.Autosize>
					{searchError && (
						<Alert
							color="red"
							title="Couldn't find matching elements">
							{searchError}
						</Alert>
					)}
				</Stack>
				{saveError && (
					<Alert color="red" title="Couldn't create the search">
						{saveError}
					</Alert>
				)}
				<Group justify="flex-end" gap="xs">
					<Button variant="default" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="light" onClick={handleUseCustom}>
						Use without saving
					</Button>
					<Button
						onClick={handleSave}
						disabled={!name.trim()}
						loading={isSaving}>
						Save and study
					</Button>
				</Group>
			</Stack>
		</AppModal>
	);
}
