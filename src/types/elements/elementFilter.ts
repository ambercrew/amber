import { ElementNodeType } from "./elementNodeType";

export type SelectFilterOperator = "isAnyOf" | "isNoneOf";

export type DateFilterOperator =
	"today" | "withinDays" | "before" | "after" | "between";

export interface NameFilter {
	id: string;
	field: "name";
	operator: "contains" | "equals" | "startsWith" | "endsWith";
	value: string;
}

export interface TagsFilter {
	id: string;
	field: "tags";
	operator: "isAnyOf" | "isAllOf" | "isNoneOf";
	tags: string[];
}

export interface DateFilter {
	id: string;
	field: "dueDate" | "createdDate";
	operator: DateFilterOperator;
	days: number | null;
	from: string | null;
	to: string | null;
}

export interface BibliographicalSourceFilter {
	id: string;
	field: "bibliographicalSource";
	operator: SelectFilterOperator;
	sourceIds: string[];
}

export interface ElementTypeFilter {
	id: string;
	field: "elementType";
	operator: SelectFilterOperator;
	types: ElementNodeType[];
}

export interface PriorityFilter {
	id: string;
	field: "priority";
	operator: "between";
	min: number;
	max: number;
}

export interface StudyProfileFilter {
	id: string;
	field: "studyProfile";
	operator: SelectFilterOperator;
	profileIds: string[];
}

export type ElementFilter =
	| NameFilter
	| TagsFilter
	| DateFilter
	| BibliographicalSourceFilter
	| ElementTypeFilter
	| PriorityFilter
	| StudyProfileFilter;

export type ElementFilterField = ElementFilter["field"];
