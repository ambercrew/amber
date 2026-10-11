import { CreateMetaDto } from "../../../types/elements/createMetaDto";
import { OcclusionMode, OcclusionShape } from "./occlusionShape";

export interface CreateImageOcclusionDto {
	id: string;
	meta: CreateMetaDto;
	imageAssetId: string;
	imageWidth: number;
	imageHeight: number;
	shapes: OcclusionShape[];
	mode: OcclusionMode;
}
