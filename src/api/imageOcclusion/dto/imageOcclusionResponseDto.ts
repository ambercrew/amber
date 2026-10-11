import { OcclusionMode, OcclusionShape } from "./occlusionShape";

export interface ImageOcclusionResponseDto {
	id: string;
	name: string;
	imageAssetId: string;
	imageWidth: number;
	imageHeight: number;
	shapes: OcclusionShape[];
	mode: OcclusionMode;
}
