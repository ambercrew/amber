import { useCallback, useEffect } from "react";
import { MatchFlag } from "@embedpdf/models";
import { useSearch } from "@embedpdf/plugin-search/react";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
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
export function usePdfFindInPage(documentId: string | null): void {
	const opened = useAppSelector(selectSearchOpened);
	const query = useAppSelector(selectSearchQuery);
	const caseSensitive = useAppSelector(selectSearchCaseSensitive);

	const dispatch = useAppDispatch();
	const { state, provides } = useSearch(documentId ?? "");
	// The capability, not `useScroll`, whose page state would re-render the whole reader on every page change.
	const { provides: scroll } = useScrollCapability();
	const { goToPage } = usePdfCore();

	useEffect(() => {
		if (!documentId || !provides) return;

		// Also clears the previous matches when the query is emptied without closing the bar.
		if (!opened || !query) {
			provides.stopSearch();
			return;
		}

		provides.startSearch();
		provides.setFlags(caseSensitive ? [MatchFlag.MatchCase] : []);
		// Re-seeds to the match nearest the scroll position, instead of clamping the previous search's index.
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
				goToPage(result.pageIndex + 1, {
					pageCoordinates: rect.origin,
					alignY: 30,
				});
			}
		},
		[provides, goToPage, state.results],
	);

	// Nearest match at or below the current scroll position, wrapping to the first if none qualify.
	const resolveInitialIndex = useCallback(() => {
		const results = state.results;
		if (results.length === 0) return 0;

		const metrics = documentId
			? scroll?.forDocument(documentId).getMetrics()
			: undefined;
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
	}, [state.results, scroll, documentId]);

	// Results stream in page by page; reporting 0 until they're all in keeps an early batch from seeding the wrong match.
	useSyncSearchMatches({
		totalMatches: opened && !state.loading ? state.total : 0,
		resolveMatchTarget,
		onNavigate: handleNavigate,
		resolveInitialIndex,
	});
}
