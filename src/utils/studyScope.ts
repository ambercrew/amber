import { StudyScopeDto } from "../api/study/dto/studyScopeDto";
import { ElementId } from "../types/elements/elementId";

/** A custom scope covering the element and everything inside it. */
export function elementStudyScope(
	elementId: ElementId,
): Extract<StudyScopeDto, { type: "custom" }> {
	return {
		type: "custom",
		filters: [
			{
				id: crypto.randomUUID(),
				field: "descendantOf",
				operator: "isOrSelf",
				ancestor: elementId,
			},
		],
	};
}
