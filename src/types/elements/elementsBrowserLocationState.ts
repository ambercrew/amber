import { ElementFilter } from "../../api/savedSearches/dto/elementFilter";
import { ElementId } from "./elementId";

export interface ElementsBrowserState {
	filters: ElementFilter[];
	loadedSavedSearchId: string | null;
	selectedIds: ElementId[];
}

export interface ElementsBrowserLocationState {
	elementsBrowser?: ElementsBrowserState;
}
