export type SearchSortColumn = "name" | "type" | "priority" | "due";

export interface SearchSortDto {
	column: SearchSortColumn;
	direction: "asc" | "desc";
}
