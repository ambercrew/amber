import { ReadingPosition } from "./readingPosition";

export interface UpdateReadPointDto {
	learningAssetId: string;
	readPoint: ReadingPosition;
}
