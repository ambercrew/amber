import { SavedSearchFilterDto } from "./savedSearchFilterDto";

export interface SavedSearchCreateRequestDto {
	name: string;
	filters: SavedSearchFilterDto[];
}
