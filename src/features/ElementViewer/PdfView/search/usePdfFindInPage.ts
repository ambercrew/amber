import { useCallback, useEffect } from "react";
import {
	useSearch,
	useSearchHits,
	useSearchState,
} from "@embedpdf/react/search";
import { useStage } from "@embedpdf/react/stage";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import useAppSelector from "../../../../hooks/useAppSelector";
import { setSearchMatchCounts } from "../../../../stores/search/searchReducer";
import {
	selectSearchCaseSensitive,
	selectSearchOpened,
	selectSearchQuery,
} from "../../../../stores/search/searchSelectors";
import { usePdfCore } from "../core/pdfCoreContext";
import { useSyncSearchMatches } from "../../hooks/useSyncSearchMatches";

/** Wires the shared find-in-page `search` slice to embedpdf's search plugin, which finds and highlights the matches. */
export function usePdfFindInPage(): void {
	const opened = useAppSelector(selectSearchOpened);
	const query = useAppSelector(selectSearchQuery);
	const caseSensitive = useAppSelector(selectSearchCaseSensitive);

	const dispatch = useAppDispatch();
	const search = useSearch();
	const hits = useSearchHits();
	const complete = useSearchState(state => state.status === "complete");
	const stage = useStage();
	const { announceJump } = usePdfCore();

	useEffect(() => {
		// Also clears the previous matches when the query is emptied without closing the bar.
		if (!opened || !query) {
			search.clear();
			return;
		}
		// Re-seeds to the match nearest the view, instead of clamping the previous search's index.
		dispatch(setSearchMatchCounts({ currentIndex: -1, totalMatches: 0 }));
		// From the first page, so the hits come in document order.
		search
			.search({ text: query, matchCase: caseSensitive }, { from: 0 })
			.catch(() => undefined);
	}, [search, opened, query, caseSensitive, dispatch]);

	useEffect(() => () => search.clear(), [search]);

	const resolveMatchTarget = useCallback(
		(index: number) => (index >= 0 && index < hits.length ? index : null),
		[hits.length],
	);

	const handleNavigate = useCallback(
		(index: number) => {
			if (search.goToHit(index)) announceJump();
		},
		[search, announceJump],
	);

	// Nearest match at or below the top of the view, wrapping to the first if none qualify.
	const resolveInitialIndex = useCallback(() => {
		const top = stage.listVisiblePages()[0];
		if (!top || hits.length === 0) return 0;
		const topPageIndex = top.pageIndex;
		const referenceY = top.visibleRect.y;
		const index = hits.findIndex(hit => {
			if (hit.pageIndex < topPageIndex) return false;
			if (hit.pageIndex > topPageIndex) return true;
			return (hit.bounds?.y ?? 0) >= referenceY;
		});
		return index === -1 ? 0 : index;
	}, [stage, hits]);

	// Hits stream in page by page; reporting 0 until they're all in keeps an early batch from seeding the wrong match.
	useSyncSearchMatches({
		totalMatches: opened && complete ? hits.length : 0,
		resolveMatchTarget,
		onNavigate: handleNavigate,
		resolveInitialIndex,
	});
}
