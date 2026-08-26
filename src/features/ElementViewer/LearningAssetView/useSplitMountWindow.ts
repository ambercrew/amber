import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LEARNING_ASSET_SPLIT_MOUNT_NEIGHBORS } from "./learningAssetViewConstants";
import { LearningAssetSplitMetaDto } from "../../../types/elements/learningAssetSplitMetaDto";
import { useMainScrollElement } from "../../App/context/mainScrollContext";

interface Props {
	splits: LearningAssetSplitMetaDto[];
	/** Split to mount initially, locked there until `unlock` is called. */
	initialSeq: number;
}

interface ReturnValue {
	/** seqs that should currently render a live editor. */
	mountedSeqs: Set<number>;
	/** seq of the split currently at the top of the viewport. */
	primarySeq: number;
	/** Ref callback for each slot's root element, observed for viewport entry. */
	registerSlot: (seq: number) => (element: Element | null) => void;
	/**
	 * Forces the mount window onto `seq` and locks it there, bypassing the
	 * viewport observer until `unlock` is called — otherwise the still-stale
	 * scroll position would immediately override it.
	 */
	lockTo: (seq: number) => void;
	/** Resumes viewport-observer-driven tracking after a `lockTo`. */
	unlock: () => void;
}

/**
 * Decides which splits are live editors versus placeholders, from an
 * `IntersectionObserver` on every slot. The mounted set is the split at the top
 * of the viewport plus a fixed number of neighbours on each side, so it never
 * grows with the learning asset.
 */
export function useSplitMountWindow({
	splits,
	initialSeq,
}: Props): ReturnValue {
	const [primarySeq, setPrimarySeq] = useState(initialSeq);
	const intersectingRef = useRef<Set<number>>(new Set());
	const elementSeqRef = useRef<Map<Element, number>>(new Map());
	const observerRef = useRef<IntersectionObserver | null>(null);
	// Starts locked so the window stays on `initialSeq`: at open the viewport
	// sits at scrollTop 0, so the observer would otherwise report the
	// top-of-document splits as intersecting and collapse the window there
	// before anything scrolls to the actual target.
	const lockedRef = useRef(true);
	const scroller = useMainScrollElement();

	useEffect(() => {
		if (!scroller) return;

		const observer = new IntersectionObserver(
			entries => {
				for (const entry of entries) {
					const seq = elementSeqRef.current.get(entry.target);
					if (seq === undefined) continue;
					if (entry.isIntersecting) intersectingRef.current.add(seq);
					else intersectingRef.current.delete(seq);
				}
				if (intersectingRef.current.size === 0) return;
				if (lockedRef.current) return;
				const topmost = Math.min(...intersectingRef.current);
				setPrimarySeq(prev => (prev === topmost ? prev : topmost));
			},
			// The main content area is the scroller, not the window.
			{ root: scroller, threshold: 0 },
		);
		observerRef.current = observer;
		// Observe any slots whose refs were attached before this effect ran.
		elementSeqRef.current.forEach((_seq, element) =>
			observer.observe(element),
		);
		return () => {
			observer.disconnect();
			observerRef.current = null;
		};
	}, [scroller]);

	const registerSlot = useCallback(
		(seq: number) => (element: Element | null) => {
			const observer = observerRef.current;
			if (element) {
				elementSeqRef.current.set(element, seq);
				observer?.observe(element);
				return;
			}
			// Element detached: drop every mapping for this seq.
			for (const [key, value] of elementSeqRef.current) {
				if (value !== seq) continue;
				observer?.unobserve(key);
				elementSeqRef.current.delete(key);
			}
			intersectingRef.current.delete(seq);
		},
		[],
	);

	const mountedSeqs = useMemo(() => {
		const mounted = new Set<number>();
		const primaryIndex = splits.findIndex(
			split => split.seq === primarySeq,
		);
		const center = primaryIndex === -1 ? 0 : primaryIndex;
		for (
			let i = center - LEARNING_ASSET_SPLIT_MOUNT_NEIGHBORS;
			i <= center + LEARNING_ASSET_SPLIT_MOUNT_NEIGHBORS;
			i++
		) {
			if (i >= 0 && i < splits.length) mounted.add(splits[i].seq);
		}
		return mounted;
	}, [splits, primarySeq]);

	const lockTo = useCallback((seq: number) => {
		lockedRef.current = true;
		setPrimarySeq(seq);
	}, []);

	const unlock = useCallback(() => {
		lockedRef.current = false;
	}, []);

	return { mountedSeqs, primarySeq, registerSlot, lockTo, unlock };
}
