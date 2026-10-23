import { ReadingPosition } from "./readingPosition";

export const MARK_SLOTS = [1, 2, 3] as const;

export type MarkSlot = (typeof MARK_SLOTS)[number];

export interface LearningAssetMark {
	slot: MarkSlot;
	anchor: ReadingPosition;
}

export interface SetLearningAssetMarkDto {
	learningAssetId: string;
	slot: MarkSlot;
	anchor: ReadingPosition;
}

export interface ClearLearningAssetMarkDto {
	learningAssetId: string;
	slot: MarkSlot;
}
