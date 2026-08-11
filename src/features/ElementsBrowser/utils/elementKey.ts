import { ElementId } from "../../../types/elements/elementId";

export function elementKey(id: ElementId): string {
	return `${id.type}:${id.id}`;
}
