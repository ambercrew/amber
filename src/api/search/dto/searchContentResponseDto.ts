import { ElementId } from "../../../types/elements/elementId";

export interface ContentMatchDto {
	index: number;
	before: string;
	text: string;
	after: string;
}

export interface ElementContentMatchesDto {
	elementId: ElementId;
	name: string;
	matches: ContentMatchDto[];
}

export interface SearchContentResponseDto {
	elements: ElementContentMatchesDto[];
	truncated: boolean;
}
