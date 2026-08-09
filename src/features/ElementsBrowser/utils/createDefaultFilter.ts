import {
	ElementFilter,
	ElementFilterField,
} from "../../../types/elements/elementFilter";

export function createDefaultFilter(field: ElementFilterField): ElementFilter {
	const id = crypto.randomUUID();

	switch (field) {
		case "name":
			return { id, field, operator: "contains", value: "" };
		case "tags":
			return { id, field, operator: "isAnyOf", tags: [] };
		case "dueDate":
			return {
				id,
				field,
				operator: "today",
				days: null,
				from: null,
				to: null,
			};
		case "bibliographicalSource":
			return { id, field, operator: "isAnyOf", sourceIds: [] };
		case "elementType":
			return { id, field, operator: "isAnyOf", types: [] };
		case "createdDate":
			return {
				id,
				field,
				operator: "withinDays",
				days: 7,
				from: null,
				to: null,
			};
		case "priority":
			return { id, field, operator: "between", min: 70, max: 100 };
		case "studyProfile":
			return { id, field, operator: "isAnyOf", profileIds: [] };
	}
}
