import { NavigateFunction } from "react-router";
import { AppDispatch } from "../../stores/store";
import { ElementId } from "../../types/elements/elementId";

export interface ImportContext {
	dispatch: AppDispatch;
	navigate: NavigateFunction;
	parent: ElementId | null;
	priorityPosition: number;
}
