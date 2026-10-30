import { ElementId } from "../../../types/elements/elementId";

export const ELEMENTS_SUSPENDED_EVENT = "elementsSuspended";

export interface ElementsSuspendedEventDto {
	elementIds: ElementId[];
}
