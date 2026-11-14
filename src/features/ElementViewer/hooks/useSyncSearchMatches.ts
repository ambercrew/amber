import { useEffect } from "react";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	clearPendingSearchMatch,
	setSearchMatchCounts,
} from "../../../stores/search/searchReducer";
import {
	selectSearchCurrentIndex,
	selectSearchOpened,
	selectSearchPendingMatch,
} from "../../../stores/search/searchSelectors";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";

/** How long a pending match waits for its element's counts before settling on the last match. */
export const PENDING_MATCH_TIMEOUT_IN_MILLISECONDS = 1500;

interface Props<Target> {
	totalMatches: number;
	resolveMatchTarget: (globalIndex: number) => Target | null;
	onNavigate: (target: Target) => void;
	/** Computes the index to seed when there's no current match yet. */
	resolveInitialIndex: () => number;
	/** False while some matches are still uncounted, so a requested match index can't be placed yet. */
	countsComplete?: boolean;
}

/**
 * Keeps the `search` Redux slice's `totalMatches`/`currentIndex` in sync with
 * a surface's own match aggregation, and scrolls to the current match
 * whenever it changes. Shared by all three find-in-page surfaces (learning asset,
 * extract, card).
 */
export function useSyncSearchMatches<Target>({
	totalMatches,
	resolveMatchTarget,
	onNavigate,
	resolveInitialIndex,
	countsComplete = true,
}: Props<Target>): void {
	const dispatch = useAppDispatch();
	const opened = useAppSelector(selectSearchOpened);
	const reduxCurrentIndex = useAppSelector(selectSearchCurrentIndex);
	const currentElementId = useAppSelector(
		state => selectCurrentElement(state)?.data.meta.elementId.id,
	);
	const pendingMatch = useAppSelector(selectSearchPendingMatch);
	const pendingIndex =
		pendingMatch && pendingMatch.elementId.id === currentElementId
			? pendingMatch.index
			: null;

	// Seeds `currentIndex` whenever there isn't one yet; otherwise just
	// re-clamps it. `reduxCurrentIndex` is read but not a dep, since including
	// it would fight `goToNextMatch`/`goToPreviousMatch`.
	useEffect(() => {
		if (!opened) return;

		// A requested match waits until counting reaches it, as splits report their counts one by one.
		if (pendingIndex !== null) {
			if (countsComplete && pendingIndex < totalMatches) {
				dispatch(
					setSearchMatchCounts({
						currentIndex: pendingIndex,
						totalMatches,
					}),
				);
				dispatch(clearPendingSearchMatch());
				return;
			}
			dispatch(setSearchMatchCounts({ currentIndex: -1, totalMatches }));
			const timeout = setTimeout(() => {
				dispatch(
					setSearchMatchCounts({
						currentIndex: totalMatches - 1,
						totalMatches,
					}),
				);
				dispatch(clearPendingSearchMatch());
			}, PENDING_MATCH_TIMEOUT_IN_MILLISECONDS);
			return () => clearTimeout(timeout);
		}

		const shouldSeed = reduxCurrentIndex < 0 && totalMatches > 0;
		const seededIndex = shouldSeed
			? resolveInitialIndex()
			: reduxCurrentIndex;

		const currentIndex =
			totalMatches === 0
				? -1
				: Math.min(Math.max(seededIndex, 0), totalMatches - 1);

		dispatch(setSearchMatchCounts({ currentIndex, totalMatches }));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above: reduxCurrentIndex/resolveInitialIndex are read, not depended on
	}, [dispatch, opened, totalMatches, countsComplete, pendingIndex]);

	// Navigates whenever the current match index changes.
	useEffect(() => {
		if (!opened || reduxCurrentIndex < 0) return;
		const target = resolveMatchTarget(reduxCurrentIndex);
		// Against null, not falsiness: the PDF's targets are hit indices, and the first is 0.
		if (target !== null) onNavigate(target);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- resolveMatchTarget/onNavigate intentionally excluded to avoid re-navigating on every re-creation of these callbacks
	}, [opened, reduxCurrentIndex]);
}
