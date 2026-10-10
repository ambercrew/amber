import { SavedSearchFilterDto } from "./savedSearchFilterDto";
import { SearchSortDto } from "../../search/dto/searchSortDto";

export interface SavedSearchUpdateFiltersRequestDto {
	filters: SavedSearchFilterDto[];
	sort: SearchSortDto;
}
