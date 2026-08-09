import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button, Group, Paper, Stack, TextInput } from "@mantine/core";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import {
	ElementFilter,
	ElementFilterField,
} from "../../types/elements/elementFilter";
import { ElementsBrowserLocationState } from "../../types/elements/elementsBrowserLocationState";
import { BibliographicalSourceResponseDto } from "../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { listBibliographicalSources } from "../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import { StudyProfileDto } from "../../api/study/dto/studyProfileDto";
import { listStudyProfiles } from "../../api/study/api/studyProfileApi";
import { createDefaultFilter } from "./utils/createDefaultFilter";
import FilterChip from "./components/FilterChip";
import AddFilterMenu from "./components/AddFilterMenu";

// TODO: no search button, use debounce when changing
export default function ElementsBrowser() {
	const location = useLocation();
	const navigate = useNavigate();
	const locationState = location.state as ElementsBrowserLocationState | null;

	const [search, setSearch] = useState(
		locationState?.elementsBrowser?.search ?? "",
	);
	const [searchInput, setSearchInput] = useState(search);
	const [filters, setFilters] = useState<ElementFilter[]>(
		locationState?.elementsBrowser?.filters ?? [],
	);
	const [justAddedId, setJustAddedId] = useState<string | null>(null);

	const [sources, setSources] = useState<BibliographicalSourceResponseDto[]>(
		[],
	);
	const [profiles, setProfiles] = useState<StudyProfileDto[]>([]);

	useEffect(() => {
		void listBibliographicalSources().then(setSources);
		void listStudyProfiles().then(setProfiles);
	}, []);

	useEffect(() => {
		void navigate(location.pathname, {
			replace: true,
			state: { elementsBrowser: { search, filters } },
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [search, filters]);

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

	function commitSearch() {
		setSearch(searchInput);
	}

	return (
		<Paper withBorder radius="md" p="md" maw={900} mx="auto" mt="lg">
			<Stack gap="sm">
				<Group gap="sm" wrap="nowrap">
					<TextInput
						flex={1}
						placeholder="Search"
						leftSection={<MagnifyingGlassIcon size={16} />}
						value={searchInput}
						onChange={event =>
							setSearchInput(event.currentTarget.value)
						}
						onKeyDown={event => {
							if (event.key === "Enter") {
								commitSearch();
							}
						}}
					/>
					<Button variant="default" onClick={commitSearch}>
						Search
					</Button>
				</Group>
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
