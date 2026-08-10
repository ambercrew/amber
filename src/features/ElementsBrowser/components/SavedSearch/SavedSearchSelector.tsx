import { useEffect, useState } from "react";
import { Badge, Button, Group, Menu, Text, Tooltip } from "@mantine/core";
import {
	BookmarkSimpleIcon,
	CaretDownIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { ElementFilter } from "../../../../api/savedSearches/dto/elementFilter";
import { SavedSearchResponseDto } from "../../../../api/savedSearches/dto/savedSearchResponseDto";
import {
	createSavedSearch,
	deleteSavedSearch,
	duplicateSavedSearch,
	getSavedSearchFilters,
	listSavedSearches,
	renameSavedSearch,
	updateSavedSearchFilters,
} from "../../../../api/savedSearches/api/savedSearchesApi";
import { isSavedSearchEdited } from "../../utils/isSavedSearchEdited";
import {
	fromSavedSearchFilterDtos,
	toSavedSearchFilterDtos,
} from "../../utils/savedSearchFilterDto";
import SavedSearchMenuRow from "./SavedSearchMenuRow";
import SaveSavedSearchModal from "./SaveSavedSearchModal";
import RenameSavedSearchModal from "./RenameSavedSearchModal";
import DeleteSavedSearchModal from "./DeleteSavedSearchModal";

interface SavedSearchSelectorProps {
	filters: ElementFilter[];
	onFiltersChange: (filters: ElementFilter[]) => void;
	loadedSavedSearchId: string | null;
	onLoadedSavedSearchIdChange: (id: string | null) => void;
	savedSearches: SavedSearchResponseDto[];
	onSavedSearchesChange: (savedSearches: SavedSearchResponseDto[]) => void;
}

export default function SavedSearchSelector({
	filters,
	onFiltersChange,
	loadedSavedSearchId,
	onLoadedSavedSearchIdChange,
	savedSearches,
	onSavedSearchesChange,
}: SavedSearchSelectorProps) {
	const [menuOpened, setMenuOpened] = useState(false);
	const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
	const [renamingSearch, setRenamingSearch] =
		useState<SavedSearchResponseDto | null>(null);
	const [deletingSearch, setDeletingSearch] =
		useState<SavedSearchResponseDto | null>(null);
	const [loadedFilters, setLoadedFilters] = useState<ElementFilter[] | null>(
		null,
	);

	const loadedSavedSearch =
		savedSearches.find(s => s.id === loadedSavedSearchId) ?? null;
	const edited = loadedSavedSearchId
		? isSavedSearchEdited(filters, loadedFilters)
		: false;

	useEffect(() => {
		if (!loadedSavedSearchId) return;
		void getSavedSearchFilters(loadedSavedSearchId).then(filterDtos => {
			setLoadedFilters(fromSavedSearchFilterDtos(filterDtos));
		});
	}, [loadedSavedSearchId]);

	async function refresh(): Promise<void> {
		const list = await listSavedSearches();
		onSavedSearchesChange(list);
	}

	async function handleSelect(savedSearch: SavedSearchResponseDto) {
		const filterDtos = await getSavedSearchFilters(savedSearch.id);
		const loaded = fromSavedSearchFilterDtos(filterDtos);
		onLoadedSavedSearchIdChange(savedSearch.id);
		onFiltersChange(loaded);
		setLoadedFilters(loaded);
		setMenuOpened(false);
	}

	async function handleCreateNew(name: string) {
		const created = await createSavedSearch({
			name,
			filters: toSavedSearchFilterDtos(filters),
		});
		await refresh();
		onLoadedSavedSearchIdChange(created.id);
		setLoadedFilters(filters);
	}

	async function handleSaveExisting() {
		if (!loadedSavedSearchId) return;
		await updateSavedSearchFilters(loadedSavedSearchId, {
			filters: toSavedSearchFilterDtos(filters),
		});
		await refresh();
		setLoadedFilters(filters);
	}

	function handleRevert() {
		if (loadedFilters) onFiltersChange(loadedFilters);
	}

	async function handleRename(
		savedSearch: SavedSearchResponseDto,
		name: string,
	) {
		await renameSavedSearch(savedSearch.id, { name });
		await refresh();
	}

	async function handleDuplicate(savedSearch: SavedSearchResponseDto) {
		const duplicated = await duplicateSavedSearch(savedSearch.id);
		const filterDtos = await getSavedSearchFilters(duplicated.id);
		const loaded = fromSavedSearchFilterDtos(filterDtos);
		await refresh();
		onLoadedSavedSearchIdChange(duplicated.id);
		onFiltersChange(loaded);
		setLoadedFilters(loaded);
		setMenuOpened(false);
	}

	async function handleDelete(savedSearch: SavedSearchResponseDto) {
		await deleteSavedSearch(savedSearch.id);
		await refresh();
		if (loadedSavedSearchId === savedSearch.id) {
			onLoadedSavedSearchIdChange(null);
		}
	}

	return (
		<>
			<Group gap="xs" wrap="nowrap" justify="space-between">
				<Menu
					opened={menuOpened}
					onChange={setMenuOpened}
					position="bottom-start"
					width={280}
					withinPortal
					closeOnItemClick={false}>
					<Menu.Target>
						<Tooltip
							label={
								loadedSavedSearch?.name ?? "Untitled search"
							}>
							<Button
								variant="default"
								leftSection={<BookmarkSimpleIcon size={16} />}
								rightSection={<CaretDownIcon size={14} />}>
								<Group gap={6} wrap="nowrap">
									<Text truncate maw={200}>
										{loadedSavedSearch?.name ??
											"Untitled search"}
									</Text>
									{edited && (
										<Badge variant="light" color="blue">
											Edited
										</Badge>
									)}
								</Group>
							</Button>
						</Tooltip>
					</Menu.Target>
					<Menu.Dropdown onClick={event => event.stopPropagation()}>
						<Menu.Label>Saved searches</Menu.Label>
						{savedSearches.map(savedSearch => (
							<SavedSearchMenuRow
								key={savedSearch.id}
								savedSearch={savedSearch}
								selected={
									savedSearch.id === loadedSavedSearchId
								}
								onSelect={() => void handleSelect(savedSearch)}
								onRename={() => setRenamingSearch(savedSearch)}
								onDuplicate={() =>
									void handleDuplicate(savedSearch)
								}
								onDelete={() => setDeletingSearch(savedSearch)}
							/>
						))}
						<Menu.Divider />
						<Menu.Item
							leftSection={<PlusIcon size={14} />}
							onClick={() => {
								setMenuOpened(false);
								setIsSaveModalOpen(true);
							}}>
							Save current filters
						</Menu.Item>
					</Menu.Dropdown>
				</Menu>

				<Group gap="xs" wrap="nowrap">
					{loadedSavedSearch && edited && (
						<Button variant="default" onClick={handleRevert}>
							Revert
						</Button>
					)}
					{(!loadedSavedSearch || edited) && (
						<Button
							onClick={() =>
								loadedSavedSearch
									? void handleSaveExisting()
									: setIsSaveModalOpen(true)
							}>
							Save
						</Button>
					)}
				</Group>
			</Group>

			<SaveSavedSearchModal
				opened={isSaveModalOpen}
				onClose={() => setIsSaveModalOpen(false)}
				onConfirm={name => void handleCreateNew(name)}
			/>
			{renamingSearch && (
				<RenameSavedSearchModal
					key={renamingSearch.id}
					opened
					initialName={renamingSearch.name}
					onClose={() => setRenamingSearch(null)}
					onConfirm={name => void handleRename(renamingSearch, name)}
				/>
			)}
			{deletingSearch && (
				<DeleteSavedSearchModal
					key={deletingSearch.id}
					opened
					savedSearchName={deletingSearch.name}
					onClose={() => setDeletingSearch(null)}
					onConfirm={() => void handleDelete(deletingSearch)}
				/>
			)}
		</>
	);
}
