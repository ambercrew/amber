import { useCallback, useEffect, useEffectEvent, useRef } from "react";

/** Observes slots in `scroller` and reports the topmost one intersecting it whenever that may have changed. */
export function useTopVisibleSlot(
	scroller: HTMLElement | null,
	onTopSlot: (seq: number) => void,
): (seq: number) => (element: Element | null) => void {
	const intersectingRef = useRef<Set<number>>(new Set());
	const elementSeqRef = useRef<Map<Element, number>>(new Map());
	const observerRef = useRef<IntersectionObserver | null>(null);
	const reportTop = useEffectEvent(onTopSlot);

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
				if (intersectingRef.current.size > 0)
					reportTop(Math.min(...intersectingRef.current));
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

	return useCallback(
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
}
