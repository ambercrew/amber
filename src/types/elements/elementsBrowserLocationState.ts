import { ElementFilter } from "../../api/savedSearches/dto/elementFilter";
import { ElementId } from "./elementId";
import { SearchSortDto } from "../../api/search/dto/searchSortDto";

export interface ElementsBrowserState {
	filters: ElementFilter[];
	loadedSavedSearchId: string | null;
	selectedIds: ElementId[];
	sort?: SearchSortDto;
}

export interface ElementsBrowserLocationState {
	elementsBrowser?: ElementsBrowserState;
}
