import { OcclusionMode, OcclusionShape } from "./occlusionShape";

export interface UpdateImageOcclusionDto {
	id: string;
	shapes: OcclusionShape[];
	mode: OcclusionMode;
}
