import { NavigateFunction } from "react-router";
import { AppDispatch } from "../../stores/store";
import { ElementId } from "../../types/elements/elementId";

/** Imported elements default to the middle of the priority queue rather than
 * the front, since importing many items shouldn't bump them all ahead of
 * whatever the user had already triaged. */
export const DEFAULT_IMPORT_PRIORITY_PERCENTAGE = 50;

export interface ImportContext {
	dispatch: AppDispatch;
	navigate: NavigateFunction;
	parent: ElementId | null;
	priorityRank: number;
}
