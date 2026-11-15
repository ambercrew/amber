import { invoke } from "@tauri-apps/api/core";
import { SearchContentRequestDto } from "../dto/searchContentRequestDto";
import { SearchContentResponseDto } from "../dto/searchContentResponseDto";
import { SearchElementResultDto } from "../dto/searchElementResultDto";
import { SearchElementsRequestDto } from "../dto/searchElementsRequestDto";

export function searchElements(
	dto: SearchElementsRequestDto,
): Promise<SearchElementResultDto[]> {
	return invoke("search_elements", { dto });
}

export function searchContent(
	dto: SearchContentRequestDto,
): Promise<SearchContentResponseDto | null> {
	return invoke("search_content", { dto });
}
