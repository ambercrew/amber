import { SearchSortDto } from "../../search/dto/searchSortDto";

export interface SavedSearchResponseDto {
	id: string;
	createdAt: string;
	modifiedAt: string;
	name: string;
	/** `null` for searches saved before sorting existed. */
	sort: SearchSortDto | null;
}
