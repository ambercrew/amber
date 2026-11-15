import {
	ContentMatchDto,
	ElementContentMatchesDto,
} from "../../../api/search/dto/searchContentResponseDto";

export type SearchResultRow =
	| {
			kind: "element";
			key: string;
			element: ElementContentMatchesDto;
			collapsed: boolean;
	  }
	| {
			kind: "match";
			key: string;
			element: ElementContentMatchesDto;
			match: ContentMatchDto;
	  };

export function searchMatchKey(elementId: string, index: number) {
	return `${elementId}:${index}`;
}

/** One row per element, then one per match unless its element is collapsed. */
export function flattenSearchResults(
	elements: ElementContentMatchesDto[],
	collapsedIds: ReadonlySet<string>,
): SearchResultRow[] {
	const rows: SearchResultRow[] = [];
	for (const element of elements) {
		const { id } = element.elementId;
		const collapsed = collapsedIds.has(id);
		rows.push({ kind: "element", key: id, element, collapsed });
		if (collapsed) continue;
		for (const match of element.matches)
			rows.push({
				kind: "match",
				key: searchMatchKey(id, match.index),
				element,
				match,
			});
	}
	return rows;
}
