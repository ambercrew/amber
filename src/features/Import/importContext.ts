import { AppDispatch } from "../../stores/store";
import { ElementId } from "../../types/elements/elementId";

export interface ImportContext {
	dispatch: AppDispatch;
	parent: ElementId | null;
	priorityPosition: number;
	/** Added to the element an import creates, e.g. a learning asset or a deck's folder. */
	tags?: string[];
}
