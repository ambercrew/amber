import {
	SearchSortColumn,
	SearchSortDto,
} from "../../../api/search/dto/searchSortDto";
import { SavedSearchResponseDto } from "../../../api/savedSearches/dto/savedSearchResponseDto";

export const DEFAULT_SEARCH_SORT: SearchSortDto = {
	column: "name",
	direction: "asc",
};

/** Clicking the sorted column flips it; any other column starts ascending. */
export function nextSearchSort(
	current: SearchSortDto,
	column: SearchSortColumn,
): SearchSortDto {
	if (current.column !== column) return { column, direction: "asc" };
	return {
		column,
		direction: current.direction === "asc" ? "desc" : "asc",
	};
}

export function savedSearchSort(savedSearch: SavedSearchResponseDto) {
	return savedSearch.sort ?? DEFAULT_SEARCH_SORT;
}

export function isSameSearchSort(a: SearchSortDto, b: SearchSortDto) {
	return a.column === b.column && a.direction === b.direction;
}
