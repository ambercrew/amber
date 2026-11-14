import { ElementId } from "../../../types/elements/elementId";

export interface ImportAnkiRequestDto {
	bytesBase64: string;
	parent: ElementId | null;
	bibliographicalSourceId: string | null;
	/** Added to the folder the import resolves to. */
	tags?: string[];
}
