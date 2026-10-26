import { ElementId } from "../../../types/elements/elementId";

export const ELEMENT_RENAMED_EVENT = "elementRenamed";

export interface ElementRenamedEventDto {
	elementId: ElementId;
	name: string;
}
