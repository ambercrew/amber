import { useCallback, useEffect, useRef } from "react";
import { LEARNING_ASSET_HEIGHT_WRITE_DEBOUNCE_IN_MILLISECONDS } from "../learningAssetViewConstants";
import { useKeyedRefCallbacks } from "../useKeyedRefCallbacks";
import { estimateSplitHeight } from "./estimateSplitHeight";
import { loadSplitHeights, saveSplitHeights } from "./splitHeightsStorage";

interface ReturnValue {
	/** Best-known height for a split: measured/stored, else an estimate. */
	getHeight: (seq: number, charCount: number) => number;
	/**
	 * Ref callback for a mounted split's root: a `ResizeObserver` (which also reports on first observe)
	 * measures it and caches the height debounced, so its placeholder matches once it unmounts.
	 */
	observeSplit: (
		seq: number,
		charCount: number,
	) => (element: HTMLElement | null) => void;
}

/**
 * One learning asset's split heights, seeded from localStorage. Kept in a ref, not state: placeholders
 * read them during render, and whatever reveals a placeholder re-renders anyway.
 */
export function useSplitHeights(
	learningAssetId: string,
	contentWidth: number,
): ReturnValue {
	const heightsRef = useRef<Record<number, number>>({});
	const observersRef = useRef<Map<number, ResizeObserver>>(new Map());
	const persistTimeoutRef = useRef<number | null>(null);

	// Re-seed from storage whenever the learning asset changes.
	useEffect(() => {
		heightsRef.current = loadSplitHeights(learningAssetId);
	}, [learningAssetId]);

	const schedulePersist = useCallback(() => {
		if (persistTimeoutRef.current !== null) {
			clearTimeout(persistTimeoutRef.current);
		}
		persistTimeoutRef.current = window.setTimeout(() => {
			persistTimeoutRef.current = null;
			saveSplitHeights(learningAssetId, heightsRef.current);
		}, LEARNING_ASSET_HEIGHT_WRITE_DEBOUNCE_IN_MILLISECONDS);
	}, [learningAssetId]);

	const getHeight = useCallback(
		(seq: number, charCount: number) =>
			heightsRef.current[seq] ??
			estimateSplitHeight(charCount, contentWidth),
		[contentWidth],
	);

	const createObserver = useCallback(
		(seq: number, charCount: number) => (element: HTMLElement | null) => {
			const existing = observersRef.current.get(seq);
			if (existing) {
				existing.disconnect();
				observersRef.current.delete(seq);
			}
			if (!element) return;

			const observer = new ResizeObserver(() => {
				const newHeight = element.offsetHeight;
				if (newHeight <= 0) return;
				if (getHeight(seq, charCount) === newHeight) return;

				heightsRef.current[seq] = newHeight;
				schedulePersist();
			});
			observer.observe(element);
			observersRef.current.set(seq, observer);
		},
		[schedulePersist, getHeight],
	);
	const observeSplit = useKeyedRefCallbacks(createObserver);

	// Tear down observers and flush any pending write on unmount.
	useEffect(() => {
		const observers = observersRef.current;
		return () => {
			observers.forEach(observer => observer.disconnect());
			observers.clear();
			if (persistTimeoutRef.current !== null) {
				clearTimeout(persistTimeoutRef.current);
			}
		};
	}, []);

	return { getHeight, observeSplit };
}
