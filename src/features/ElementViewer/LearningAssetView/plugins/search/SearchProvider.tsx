import { PropsWithChildren, useCallback, useMemo } from "react";
import { scrollToRange } from "../../../../../components/Editor/plugins/SearchHighlightPlugin/scrollToRange";
import { searchHighlightRegistry } from "../../../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightRegistry";
import useAppSelector from "../../../../../hooks/useAppSelector";
import {
	selectSearchCaseSensitive,
	selectSearchCurrentIndex,
	selectSearchQuery,
} from "../../../../../stores/search/searchSelectors";
import { useSyncSearchMatches } from "../../../hooks/useSyncSearchMatches";
import { useReaderCore } from "../../core/readerCoreContext";
import { LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX } from "../../core/learningAssetViewConstants";
import { findNearestMatchAtOrBelowViewport } from "./findNearestMatchAtOrBelowViewport";
import { SearchContext } from "./searchContext";
import { MatchTarget, useLearningAssetSearch } from "./useLearningAssetSearch";

/** Index of the first of split `seq`'s live matches at or below the viewport top, or `null` if none. */
function localMatchAtOrBelowViewport(seq: number): number | null {
	const ranges = searchHighlightRegistry.getRanges(String(seq));
	if (!ranges) return null;
	const index = ranges.findIndex(
		range =>
			range !== null &&
			range.getBoundingClientRect().top >=
				LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX,
	);
	return index === -1 ? null : index;
}

/** Find-in-page across every split, mounted or not, kept in sync with the `search` Redux slice. */
export default function SearchProvider({ children }: PropsWithChildren) {
	const { learningAssetId, splits, mountedSeqs, primarySeq, navigate } =
		useReaderCore();
	const query = useAppSelector(selectSearchQuery);
	const caseSensitive = useAppSelector(selectSearchCaseSensitive);
	const currentIndex = useAppSelector(selectSearchCurrentIndex);

	const {
		onSplitMatches,
		totalMatches,
		countsBySeq,
		resolveMatchTarget,
		toGlobalIndex,
	} = useLearningAssetSearch({
		learningAssetId,
		splits,
		query,
		caseSensitive,
		mountedSeqs,
	});

	const goToMatch = useCallback(
		({ seq, localIndex }: MatchTarget) =>
			navigate(seq, root => {
				const range = searchHighlightRegistry.getRanges(String(seq))?.[
					localIndex
				];
				// Ranges not resolved yet — fall back to the split's root.
				if (range) scrollToRange(range);
				else root.scrollIntoView({ block: "start" });
			}),
		[navigate],
	);
	const resolveInitialIndex = useCallback(() => {
		const target = findNearestMatchAtOrBelowViewport(
			splits,
			countsBySeq,
			primarySeq,
			localMatchAtOrBelowViewport,
		);
		return target ? toGlobalIndex(target) : 0;
	}, [splits, countsBySeq, primarySeq, toGlobalIndex]);
	useSyncSearchMatches({
		totalMatches,
		resolveMatchTarget,
		onNavigate: goToMatch,
		resolveInitialIndex,
	});

	const currentTarget = useMemo(
		() => (currentIndex >= 0 ? resolveMatchTarget(currentIndex) : null),
		[currentIndex, resolveMatchTarget],
	);
	const value = useMemo(
		() => ({ query, caseSensitive, currentTarget, onSplitMatches }),
		[query, caseSensitive, currentTarget, onSplitMatches],
	);

	return <SearchContext value={value}>{children}</SearchContext>;
}
