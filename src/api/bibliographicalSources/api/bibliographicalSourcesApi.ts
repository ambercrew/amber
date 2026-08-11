import { invoke } from "@tauri-apps/api/core";
import { ElementId } from "../../../types/elements/elementId";
import {
	BibliographicalSourceRequestDto,
	BibliographicalSourceResponseDto,
} from "../dto/bibliographicalSourceDto";

export function listBibliographicalSources(): Promise<
	BibliographicalSourceResponseDto[]
> {
	return invoke("list_bibliographical_sources");
}

export function getBibliographicalSource(
	id: string,
): Promise<BibliographicalSourceResponseDto> {
	return invoke("get_bibliographical_source", { id });
}

export function createBibliographicalSource(
	dto: BibliographicalSourceRequestDto,
): Promise<BibliographicalSourceResponseDto> {
	return invoke("create_bibliographical_source", { dto });
}

export function updateBibliographicalSource(
	id: string,
	dto: BibliographicalSourceRequestDto,
): Promise<BibliographicalSourceResponseDto> {
	return invoke("update_bibliographical_source", { id, dto });
}

export function deleteBibliographicalSource(id: string): Promise<void> {
	return invoke("delete_bibliographical_source", { id });
}

export function assignBibliographicalSource(
	elementId: ElementId,
	bibliographicalSourceId: string | null,
): Promise<void> {
	return invoke("assign_bibliographical_source", {
		elementId,
		bibliographicalSourceId,
	});
}

export function assignBibliographicalSourceBulk(
	elementIds: ElementId[],
	bibliographicalSourceId: string | null,
): Promise<void> {
	return invoke("assign_bibliographical_source_bulk", {
		elementIds,
		bibliographicalSourceId,
	});
}
