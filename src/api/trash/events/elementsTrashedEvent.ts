import { ElementId } from "../../../types/elements/elementId";

export const ELEMENTS_TRASHED_EVENT = "elementsTrashed";

export interface ElementsTrashedEventDto {
	elementIds: ElementId[];
}
