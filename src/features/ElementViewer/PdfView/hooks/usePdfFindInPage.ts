import { useCallback, useEffect } from "react";
import { MatchFlag } from "@embedpdf/models";
import { useSearch } from "@embedpdf/plugin-search/react";
import { useScroll } from "@embedpdf/plugin-scroll/react";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import useAppSelector from "../../../../hooks/useAppSelector";
import { setSearchMatchCounts } from "../../../../stores/search/searchReducer";
import {
	selectSearchCaseSensitive,
	selectSearchOpened,
	selectSearchQuery,
} from "../../../../stores/search/searchSelectors";
import { useSyncSearchMatches } from "../../hooks/useSyncSearchMatches";

/**
 * Wires the shared find-in-page `search` Redux slice to embedpdf's own
 * search plugin, which owns match-finding and highlighting (via
 * `SearchLayer`) for the PDF's text layer.
 */
export function usePdfFindInPage(documentId: string | null): void {
	const opened = useAppSelector(selectSearchOpened);
	const query = useAppSelector(selectSearchQuery);
	const caseSensitive = useAppSelector(selectSearchCaseSensitive);

	const dispatch = useAppDispatch();
	const { state, provides } = useSearch(documentId ?? "");
	const { provides: scrollProvides } = useScroll(documentId ?? "");

	useEffect(() => {
		if (!documentId || !provides) return;

		// Also clears stale results/highlights when the query is emptied
		// without closing the bar, instead of leaving the previous search's
		// matches on screen.
		if (!opened || !query) {
			provides.stopSearch();
			return;
		}

		provides.startSearch();
		provides.setFlags(caseSensitive ? [MatchFlag.MatchCase] : []);
		// Otherwise a leftover currentIndex from the previous search just
		// gets clamped into the new result set below, instead of re-seeding
		// to the match nearest the current scroll position.
		dispatch(setSearchMatchCounts({ currentIndex: -1, totalMatches: 0 }));
		void provides.searchAllPages(query);
	}, [documentId, provides, opened, query, caseSensitive, dispatch]);

	useEffect(() => {
		if (!documentId || !provides) return;
		return () => provides.stopSearch();
	}, [documentId, provides]);

	const resolveMatchTarget = useCallback(
		(index: number) =>
			index >= 0 && index < state.results.length ? index : null,
		[state.results.length],
	);

	const handleNavigate = useCallback(
		(index: number) => {
			provides?.goToResult(index);
			const result = state.results[index];
			const rect = result?.rects[0];
			if (rect) {
				scrollProvides?.scrollToPage({
					pageNumber: result.pageIndex + 1,
					pageCoordinates: rect.origin,
					behavior: "smooth",
					alignY: 30,
				});
			}
		},
		[provides, scrollProvides, state.results],
	);

	// Nearest match at or below the current scroll position, wrapping to the
	// first match if none qualify.
	const resolveInitialIndex = useCallback(() => {
		const results = state.results;
		if (results.length === 0) return 0;

		const metrics = scrollProvides?.getMetrics();
		const topVisiblePage = metrics?.visiblePages[0];
		if (topVisiblePage === undefined) return 0;

		const topMetric = metrics?.pageVisibilityMetrics.find(
			metric => metric.pageNumber === topVisiblePage,
		);
		const referenceY = topMetric?.original.pageY ?? 0;

		const index = results.findIndex(result => {
			const pageNumber = result.pageIndex + 1;
			if (pageNumber < topVisiblePage) return false;
			if (pageNumber > topVisiblePage) return true;
			return (result.rects[0]?.origin.y ?? 0) >= referenceY;
		});

		return index === -1 ? 0 : index;
	}, [state.results, scrollProvides]);

	// `searchAllPages` streams results in page by page — `state.total` climbs
	// incrementally while `state.loading` is true, so seeding off an early,
	// partial batch would jump to whatever page happened to be searched
	// first instead of the match nearest the current scroll position.
	// Reporting 0 until loading finishes withholds seeding until the full
	// result set (and thus the real nearest match) is known.
	useSyncSearchMatches({
		totalMatches: opened && !state.loading ? state.total : 0,
		resolveMatchTarget,
		onNavigate: handleNavigate,
		resolveInitialIndex,
	});
}
