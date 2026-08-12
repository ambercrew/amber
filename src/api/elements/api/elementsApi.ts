import { invoke } from "@tauri-apps/api/core";
import { CreateCardDto } from "../../../types/elements/createCardDto";
import { CreateExtractDto } from "../../../types/elements/createExtractDto";
import { CreateFolderDto } from "../../../types/elements/createFolderDto";
import { CreateLearningAssetDto } from "../../../types/elements/createLearningAssetDto";
import { ElementId } from "../../../types/elements/elementId";
import { UpdateCardDto } from "../../../types/elements/updateCardDto";
import { UpdateExtractDto } from "../../../types/elements/updateExtractDto";
import { UpdateLearningAssetDto } from "../../../types/elements/updateLearningAssetDto";
import { UpdateReadPointDto } from "../../../types/elements/updateReadPointDto";
import { LearningAssetSplitIdDto } from "../../../types/elements/learningAssetSplitIdDto";
import { LearningAssetSplitMetaDto } from "../../../types/elements/learningAssetSplitMetaDto";
import { LearningAssetSplitTextDto } from "../../../types/elements/learningAssetSplitTextDto";
import { AnyElementDto } from "../dto/anyElementDto";
import { ElementDetailsResponseDto } from "../dto/elementDetailsDto";
import { NodeDto } from "../dto/nodeDto";

export function getElementTree(): Promise<NodeDto[]> {
	return invoke("get_element_tree");
}

export function renameElement(
	elementId: ElementId,
	newName: string,
): Promise<void> {
	return invoke("rename_element", { elementId, newName });
}

export function createFolder(dto: CreateFolderDto): Promise<void> {
	return invoke("create_folder", { dto });
}

export function createLearningAsset(
	dto: CreateLearningAssetDto,
): Promise<void> {
	return invoke("create_learning_asset", { dto });
}

export function createExtract(dto: CreateExtractDto): Promise<void> {
	return invoke("create_extract", { dto });
}

export function createCard(dto: CreateCardDto): Promise<void> {
	return invoke("create_card", { dto });
}

export function updateLearningAsset(
	dto: UpdateLearningAssetDto,
): Promise<void> {
	return invoke("update_learning_asset", { dto });
}

export function getLearningAssetSplitManifest(
	learningAssetId: string,
): Promise<LearningAssetSplitMetaDto[]> {
	return invoke("get_learning_asset_split_manifest", { learningAssetId });
}

export function getLearningAssetSplitContent(
	splitId: LearningAssetSplitIdDto,
): Promise<string> {
	return invoke("get_learning_asset_split_content", { dto: splitId });
}

export function getLearningAssetSplitTexts(
	learningAssetId: string,
): Promise<LearningAssetSplitTextDto[]> {
	return invoke("get_learning_asset_split_texts", { learningAssetId });
}

export function updateReadPoint(dto: UpdateReadPointDto): Promise<void> {
	return invoke("update_read_point", { dto });
}

export function updateExtract(dto: UpdateExtractDto): Promise<void> {
	return invoke("update_extract", { dto });
}

export function updateCard(dto: UpdateCardDto): Promise<void> {
	return invoke("update_card", { dto });
}

export function elementExists(elementId: ElementId): Promise<boolean> {
	return invoke("element_exists", { elementId });
}

export function getElementById(elementId: ElementId): Promise<AnyElementDto> {
	return invoke("get_element_by_id", { elementId });
}

export function getElementDetails(
	elementId: ElementId,
): Promise<ElementDetailsResponseDto> {
	return invoke("get_element_details", { elementId });
}

export type DropPosition = "before" | "after" | "inside";

export interface MoveElementDto {
	draggedId: ElementId;
	targetId: ElementId | null;
	position: DropPosition;
}

export function moveElement(dto: MoveElementDto): Promise<void> {
	return invoke("move_element", { dto });
}

export function updateElementTags(
	elementId: ElementId,
	tags: string[],
): Promise<void> {
	return invoke("update_element_tags", { elementId, tags });
}

export function addTagBulk(
	elementIds: ElementId[],
	tags: string[],
): Promise<void> {
	return invoke("add_tag_bulk", { elementIds, tags });
}

export function removeTagBulk(
	elementIds: ElementId[],
	tags: string[],
): Promise<void> {
	return invoke("remove_tag_bulk", { elementIds, tags });
}

export function updateIntervalMultiplier(
	elementId: ElementId,
	intervalMultiplier: number,
): Promise<void> {
	return invoke("update_interval_multiplier", {
		elementId,
		intervalMultiplier,
	});
}

export function setElementPriorityByRank(
	elementId: ElementId,
	rank: number,
): Promise<void> {
	return invoke("set_element_priority_by_rank", { elementId, rank });
}

export function setElementPriorityByPercentage(
	elementId: ElementId,
	percentage: number,
): Promise<void> {
	return invoke("set_element_priority_by_percentage", {
		elementId,
		percentage,
	});
}

export function clearDerivedFrom(elementId: ElementId): Promise<void> {
	return invoke("clear_derived_from", { elementId });
}
