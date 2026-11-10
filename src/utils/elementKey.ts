import { ElementId } from "../types/elements/elementId";

export function elementKey(id: ElementId): string {
	return `${id.type}:${id.id}`;
}

export function isSameElement(a: ElementId, b: ElementId): boolean {
	return a.type === b.type && a.id === b.id;
}
