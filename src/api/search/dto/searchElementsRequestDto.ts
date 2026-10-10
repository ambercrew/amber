import { ElementFilter } from "../../savedSearches/dto/elementFilter";
import { SearchSortDto } from "./searchSortDto";

export interface SearchElementsRequestDto {
	filters: ElementFilter[];
	sort?: SearchSortDto;
	limit?: number;
}
