import { ElementId } from "../../../types/elements/elementId";

export interface ImportAnkiRequestDto {
	bytesBase64: string;
	parent: ElementId | null;
	bibliographicalSourceId: string | null;
}
