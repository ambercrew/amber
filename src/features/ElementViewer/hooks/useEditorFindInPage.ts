import { useCallback } from "react";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	selectSearchCaseSensitive,
	selectSearchCurrentIndex,
	selectSearchQuery,
} from "../../../stores/search/searchSelectors";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import { scrollToRange } from "../../../components/Editor/plugins/SearchHighlightPlugin/scrollToRange";
import { useSearchHighlightRegistry } from "../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightRegistryContext";
import { HEADER_AND_FOOTER_HEIGHT } from "../../../config/layout";
import {
	useSingleEditorSearch,
	type MatchTarget,
} from "./useSingleEditorSearch";
import { useSyncSearchMatches } from "./useSyncSearchMatches";

interface ReturnValue {
	query: string;
	caseSensitive: boolean;
	onMatches: (editorKey: string, count: number) => void;
	/** The current match's local index within `editorKey`'s own matches, or null if it doesn't own the current match. */
	matchIndexFor: (editorKey: string) => number | null;
}

/**
 * Find-in-page for a fixed, always-mounted set of editors (an extract, or a card's front and back);
 * learning assets use their search plugin, as unmounted splits complicate it.
 */
export function useEditorFindInPage(editorKeys: string[]): ReturnValue {
	const searchHighlightRegistry = useSearchHighlightRegistry();
	const query = useAppSelector(selectSearchQuery);
	const caseSensitive = useAppSelector(selectSearchCaseSensitive);
	const currentIndex = useAppSelector(selectSearchCurrentIndex);
	const elementId = useAppSelector(
		state => selectCurrentElement(state)?.data.meta.elementId.id,
	);

	// Counts from another element or query must not place a requested match.
	const { onMatches, totalMatches, countsComplete, resolveMatchTarget } =
		useSingleEditorSearch(
			editorKeys,
			JSON.stringify([elementId, query, caseSensitive]),
		);

	const handleNavigate = useCallback(
		(target: MatchTarget) => {
			const range = searchHighlightRegistry.getRanges(target.editorKey)?.[
				target.localIndex
			];
			if (range) scrollToRange(range);
		},
		[searchHighlightRegistry],
	);

	// Nearest match at or below the viewport, scanning editors in order and
	// wrapping to the first match if none qualify.
	const resolveInitialIndex = useCallback(() => {
		let globalIndex = 0;
		let firstMatchIndex: number | null = null;
		for (const editorKey of editorKeys) {
			const ranges = searchHighlightRegistry.getRanges(editorKey) ?? [];
			if (ranges.length === 0) continue;
			firstMatchIndex ??= globalIndex;
			const localIndex = ranges.findIndex(
				range =>
					range !== null &&
					range.getBoundingClientRect().top >=
						HEADER_AND_FOOTER_HEIGHT,
			);
			if (localIndex !== -1) return globalIndex + localIndex;
			globalIndex += ranges.length;
		}
		return firstMatchIndex ?? 0;
	}, [editorKeys, searchHighlightRegistry]);

	useSyncSearchMatches({
		totalMatches,
		resolveMatchTarget,
		onNavigate: handleNavigate,
		resolveInitialIndex,
		countsComplete,
	});

	const currentTarget =
		currentIndex >= 0 ? resolveMatchTarget(currentIndex) : null;

	const matchIndexFor = useCallback(
		(editorKey: string) =>
			currentTarget?.editorKey === editorKey
				? currentTarget.localIndex
				: null,
		[currentTarget],
	);

	return { query, caseSensitive, onMatches, matchIndexFor };
}
