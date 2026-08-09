import { ElementFilter } from "../../../api/savedSearches/dto/elementFilter";
import { SavedSearchFilterDto } from "../../../api/savedSearches/dto/savedSearchFilterDto";

export function toSavedSearchFilterDtos(
	filters: ElementFilter[],
): SavedSearchFilterDto[] {
	return filters.map((filter, index) => ({ index, filter }));
}

export function fromSavedSearchFilterDtos(
	filterDtos: SavedSearchFilterDto[],
): ElementFilter[] {
	return [...filterDtos]
		.sort((a, b) => a.index - b.index)
		.map(dto => dto.filter);
}
