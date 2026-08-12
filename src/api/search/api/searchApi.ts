import { invoke } from "@tauri-apps/api/core";
import { SearchElementResultDto } from "../dto/searchElementResultDto";
import { SearchElementsRequestDto } from "../dto/searchElementsRequestDto";

export function searchElements(
	dto: SearchElementsRequestDto,
): Promise<SearchElementResultDto[]> {
	return invoke("search_elements", { dto });
}
