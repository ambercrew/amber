import { invoke } from "@tauri-apps/api/core";
import { SavedSearchCreateRequestDto } from "../dto/savedSearchCreateRequestDto";
import { SavedSearchFilterDto } from "../dto/savedSearchFilterDto";
import { SavedSearchRenameRequestDto } from "../dto/savedSearchRenameRequestDto";
import { SavedSearchResponseDto } from "../dto/savedSearchResponseDto";
import { SavedSearchUpdateFiltersRequestDto } from "../dto/savedSearchUpdateFiltersRequestDto";

export function listSavedSearches(): Promise<SavedSearchResponseDto[]> {
	return invoke("list_saved_searches");
}

export function getSavedSearchFilters(
	id: string,
): Promise<SavedSearchFilterDto[]> {
	return invoke("get_saved_search_filters", { id });
}

export function createSavedSearch(
	dto: SavedSearchCreateRequestDto,
): Promise<SavedSearchResponseDto> {
	return invoke("create_saved_search", { dto });
}

export function renameSavedSearch(
	id: string,
	dto: SavedSearchRenameRequestDto,
): Promise<SavedSearchResponseDto> {
	return invoke("rename_saved_search", { id, dto });
}

export function updateSavedSearchFilters(
	id: string,
	dto: SavedSearchUpdateFiltersRequestDto,
): Promise<void> {
	return invoke("update_saved_search_filters", { id, dto });
}

export function duplicateSavedSearch(
	id: string,
): Promise<SavedSearchResponseDto> {
	return invoke("duplicate_saved_search", { id });
}

export function deleteSavedSearch(id: string): Promise<void> {
	return invoke("delete_saved_search", { id });
}
