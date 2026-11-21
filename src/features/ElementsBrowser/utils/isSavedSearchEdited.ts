import deepEqual from "fast-deep-equal";
import { ElementFilter } from "../../../api/savedSearches/dto/elementFilter";

/**
 * Whether a loaded saved search's stored filters differ from the live ones;
 * `null` ("Untitled search") is never edited.
 */
export function isSavedSearchEdited(
	filters: ElementFilter[],
	loadedFilters: ElementFilter[] | null,
): boolean {
	if (!loadedFilters) return false;
	return !deepEqual(filters, loadedFilters);
}
