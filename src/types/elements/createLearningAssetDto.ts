import { CreateMetaDto } from "./createMetaDto";
import { LearningAssetType } from "../../api/elements/dto/anyElementDto";

export interface CreateLearningAssetDto {
	id: string;
	meta: CreateMetaDto;
	type: LearningAssetType;
	splits: string[];
	initialPriorityPosition?: number;
	pdfBytesBase64?: string;
	pdfPageCount?: number;
	/** The learning asset's tags; unset copies the parent's. */
	tags?: string[];
}
