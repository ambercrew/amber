import { ElementFilter } from "../../api/savedSearches/dto/elementFilter";

export interface ElementsBrowserState {
	filters: ElementFilter[];
	loadedSavedSearchId: string | null;
}

export interface ElementsBrowserLocationState {
	elementsBrowser?: ElementsBrowserState;
}
