import { ElementId } from "../../../types/elements/elementId";

/** A stable key for the import's parent, to tell when it changes. */
export function parentKey(parent: ElementId | null): string {
	return parent ? `${parent.type}:${parent.id}` : "";
}
