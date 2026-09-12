import { ElementId } from "../../../types/elements/elementId";
import { ReadPoint } from "../../../types/elements/readPoint";
import { Tag } from "../../../types/elements/tag";

export interface MetaResponseDto {
	elementId: ElementId;
	name: string;
	parent: ElementId | null;
	position: string;
	tags: Tag[];
	createdAt: string;
	modifiedAt: string;
	bibliographicalSourceId: string | null;
	derivedFrom: ElementId | null;
}

export interface FolderResponseDto {
	meta: MetaResponseDto;
}

export type LearningAssetType = "pdf" | "extracted";

export interface LearningAssetResponseDto {
	meta: MetaResponseDto;
	type: LearningAssetType;
	readPoint: ReadPoint;
	intervalMultiplier: number;
}

export interface ExtractResponseDto {
	meta: MetaResponseDto;
	content: string;
	intervalMultiplier: number;
}

export interface CardResponseDto {
	meta: MetaResponseDto;
	front: string;
	back: string;
}

export type AnyElementDto =
	| { type: "folder"; data: FolderResponseDto }
	| { type: "learningAsset"; data: LearningAssetResponseDto }
	| { type: "extract"; data: ExtractResponseDto }
	| { type: "card"; data: CardResponseDto };
