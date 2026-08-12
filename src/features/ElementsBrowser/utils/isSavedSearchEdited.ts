import deepEqual from "fast-deep-equal";
import { ElementFilter } from "../../../api/savedSearches/dto/elementFilter";

/**
 * True when a saved search is loaded and its persisted filters differ from
 * the live filters currently shown. `null` (no saved search loaded, i.e.
 * "Untitled search") is never considered edited.
 */
export function isSavedSearchEdited(
	filters: ElementFilter[],
	loadedFilters: ElementFilter[] | null,
): boolean {
	if (!loadedFilters) return false;
	return !deepEqual(filters, loadedFilters);
}
