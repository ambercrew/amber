import { useCallback } from "react";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	selectSearchCaseSensitive,
	selectSearchCurrentIndex,
	selectSearchQuery,
} from "../../../stores/search/searchSelectors";
import { scrollToRange } from "../../../components/Editor/plugins/SearchHighlightPlugin/scrollToRange";
import { searchHighlightRegistry } from "../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightRegistry";
import { HEADER_AND_FOOTER_HEIGHT } from "../../App/components/App";
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
 * Wires up find-in-page for a small, fixed, always-mounted set of editors
 * (an extract's single editor, or a card's front/back). LearningAsset uses
 * its search plugin (`LearningAssetView/plugins/search/`) instead, since
 * unmounted splits make that case more involved.
 */
export function useEditorFindInPage(editorKeys: string[]): ReturnValue {
	const query = useAppSelector(selectSearchQuery);
	const caseSensitive = useAppSelector(selectSearchCaseSensitive);
	const currentIndex = useAppSelector(selectSearchCurrentIndex);

	const { onMatches, totalMatches, resolveMatchTarget } =
		useSingleEditorSearch(editorKeys);

	const handleNavigate = useCallback((target: MatchTarget) => {
		const range = searchHighlightRegistry.getRanges(target.editorKey)?.[
			target.localIndex
		];
		if (range) scrollToRange(range);
	}, []);

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
	}, [editorKeys]);

	useSyncSearchMatches({
		totalMatches,
		resolveMatchTarget,
		onNavigate: handleNavigate,
		resolveInitialIndex,
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
