import { invoke } from "@tauri-apps/api/core";
import { ElementId } from "../../../types/elements/elementId";
import { Rating } from "../../../types/study/rating";
import { CardDuePreviewDto } from "../dto/cardDuePreviewDto";
import { CardReviewDto } from "../dto/cardReviewDto";
import { DueElementDto } from "../dto/dueElementDto";
import { LearningAssetReviewDto } from "../dto/learningAssetReviewDto";

export function getDueElements(): Promise<DueElementDto[]> {
	return invoke("get_due_elements");
}

export function gradeCard(
	cardId: string,
	rating: Rating,
	durationMs: number | null,
): Promise<CardReviewDto> {
	return invoke("grade_card", { cardId, rating, durationMs });
}

export function previewCardReview(cardId: string): Promise<CardDuePreviewDto> {
	return invoke("preview_card_review", { cardId });
}

export function nextLearningAsset(
	elementId: ElementId,
): Promise<LearningAssetReviewDto> {
	return invoke("next_learning_asset", { elementId });
}

export function previewNextLearningAsset(
	elementId: ElementId,
): Promise<string> {
	return invoke("preview_next_learning_asset", { elementId });
}

export function finishLearningAsset(
	elementId: ElementId,
): Promise<LearningAssetReviewDto> {
	return invoke("finish_learning_asset", { elementId });
}

export function unfinishLearningAsset(
	elementId: ElementId,
): Promise<LearningAssetReviewDto> {
	return invoke("unfinish_learning_asset", { elementId });
}

export function getCardReview(cardId: string): Promise<CardReviewDto | null> {
	return invoke("get_card_review", { cardId });
}

export function getLearningAssetReview(
	elementId: ElementId,
): Promise<LearningAssetReviewDto | null> {
	return invoke("get_learning_asset_review", { elementId });
}

export function finishLearningAssetsBulk(
	elementIds: ElementId[],
): Promise<void> {
	return invoke("finish_learning_assets_bulk", { elementIds });
}

export function resetRepetitionsBulk(elementIds: ElementId[]): Promise<void> {
	return invoke("reset_repetitions_bulk", { elementIds });
}

export function getFuzzFactor(): Promise<number> {
	return invoke("get_fuzz_factor");
}

export function setFuzzFactor(fuzzFactor: number): Promise<void> {
	return invoke("set_fuzz_factor", { fuzzFactor });
}
