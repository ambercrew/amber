import { ElementId } from "../../../types/elements/elementId";

export const ELEMENTS_DELETED_EVENT = "elementsDeleted";

export interface ElementsDeletedEventDto {
	elementIds: ElementId[];
}
