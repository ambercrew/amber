import { SavedSearchFilterDto } from "./savedSearchFilterDto";
import { SearchSortDto } from "../../search/dto/searchSortDto";

export interface SavedSearchCreateRequestDto {
	name: string;
	filters: SavedSearchFilterDto[];
	sort: SearchSortDto;
}
