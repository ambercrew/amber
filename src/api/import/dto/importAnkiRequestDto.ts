import { ElementId } from "../../../types/elements/elementId";

export interface ImportAnkiRequestDto {
	bytesBase64: string;
	parent: ElementId | null;
	bibliographicalSourceId: string | null;
	/** The top-level folders' tags; unset copies the parent's. */
	tags?: string[];
}
