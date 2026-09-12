import { CreateMetaDto } from "./createMetaDto";
import { LearningAssetType } from "../../api/elements/dto/anyElementDto";

export interface CreateLearningAssetDto {
	id: string;
	meta: CreateMetaDto;
	type: LearningAssetType;
	splits: string[];
	initialPriorityRank?: number;
	pdfBytesBase64?: string;
	pdfPageCount?: number;
}
