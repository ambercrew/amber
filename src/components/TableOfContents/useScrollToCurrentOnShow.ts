import { RefObject, useEffect, useLayoutEffect, useRef } from "react";

export interface ScrollTarget {
	/** Scrolls the current row, or the deepest shown heading above it, to the top of its scroller. */
	scrollToCurrent: () => void;
}

/**
 * Brings the current entry to the top each time the table comes into view: on mount (e.g. another learning asset),
 * when its tab is shown again, and when the side panel slides back in. Not while the reader scrolls past headings.
 */
export function useScrollToCurrentOnShow(
	containerRef: RefObject<HTMLElement | null>,
	targetRef: RefObject<ScrollTarget | null>,
	activeEntryId: string | null | undefined,
) {
	const pendingRef = useRef(true);
	const visibleRef = useRef(false);
	const hasActiveRef = useRef(false);

	const frameRef = useRef<number | null>(null);
	// A frame later, as on mount the virtual tree hasn't found its scroll area yet.
	const scrollIfPendingRef = useRef(() => {
		if (!pendingRef.current || !visibleRef.current || !hasActiveRef.current)
			return;
		pendingRef.current = false;
		if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = null;
			targetRef.current?.scrollToCurrent();
		});
	});

	// The current entry may only arrive after the table is shown.
	useLayoutEffect(() => {
		hasActiveRef.current = !!activeEntryId;
		scrollIfPendingRef.current();
	}, [activeEntryId]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		if (typeof IntersectionObserver === "undefined") {
			visibleRef.current = true;
			scrollIfPendingRef.current();
			return;
		}
		const observer = new IntersectionObserver(([entry]) => {
			visibleRef.current = entry.isIntersecting;
			if (entry.isIntersecting) scrollIfPendingRef.current();
			else pendingRef.current = true;
		});
		observer.observe(container);
		return () => {
			observer.disconnect();
			if (frameRef.current !== null)
				cancelAnimationFrame(frameRef.current);
			// A hidden tab drops its effects without the observer seeing it leave.
			visibleRef.current = false;
			pendingRef.current = true;
		};
	}, [containerRef]);
}
