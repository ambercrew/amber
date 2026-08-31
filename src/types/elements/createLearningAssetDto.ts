import { CreateMetaDto } from "./createMetaDto";

export interface CreateLearningAssetDto {
	id: string;
	meta: CreateMetaDto;
	splits: string[];
	initialPriorityRank?: number;
}
