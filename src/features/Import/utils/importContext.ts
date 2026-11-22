import { AppDispatch } from "../../../stores/store";
import { ElementId } from "../../../types/elements/elementId";

export interface ImportContext {
	dispatch: AppDispatch;
	parent: ElementId | null;
	priorityPosition: number;
	/** The tags of the element an import creates (a learning asset, a deck's folder); unset copies the parent's. */
	tags?: string[];
}
