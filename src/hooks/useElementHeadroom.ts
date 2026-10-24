import { useCallback, useEffect, useRef, useState } from "react";

export interface UseElementHeadroomInput {
	/** Scroll container to observe; stays pinned while it is null. */
	element: HTMLElement | null;
	/** Number in px at which the element should be fixed. */
	fixedAt?: number;
	/** Number of px to scroll to fully reveal or hide the element. */
	scrollDistance?: number;
}

export interface UseElementHeadroomReturnValue {
	/** True when the element is at least partially visible. */
	pinned: boolean;
	/** Reveal progress: 0 = fully hidden, 1 = fully visible. */
	scrollProgress: number;
	/** Ignore scroll events (programmatic ones, e.g. from zoom recentering)
	 * until they stop for `quietMs` — a zoom can trigger more than one
	 * scroll adjustment (e.g. the browser clamping scrollTop as content
	 * shrinks, then the plugin's own recenter). */
	pause: (quietMs?: number) => void;
}

const HEADROOM_HIDE_EVENT = "headroom:hide";
// How long after the last scroll a jump counts as finished, so a smooth scroll's events don't reveal it.
const HIDE_QUIET_MS = 150;
// How long to wait for a jump's first scroll, which a PDF only applies once its pages lay out.
const HIDE_SCROLL_WAIT_MS = 1000;

/** Hides the chrome observing `element` after a jump, unless the jump landed within `fixedAt` of the top. */
export function hideHeadroom(element: HTMLElement) {
	element.dispatchEvent(new Event(HEADROOM_HIDE_EVENT));
}

/**
 * Element-scoped equivalent of Mantine's `useHeadroom`, which can only observe
 * the window scroller. Returns whether pinned chrome (the header, the footer)
 * should be shown: always within `fixedAt` of the top, and below that it takes
 * `scrollDistance` px of scrolling to fully hide or reveal it again.
 *
 * The progress is accumulated across direction changes, so reversing mid-hide
 * continues from where it stopped instead of snapping, exactly as Mantine does.
 */
export function useElementHeadroom({
	element,
	fixedAt = 0,
	scrollDistance = 70,
}: UseElementHeadroomInput): UseElementHeadroomReturnValue {
	const [scrollProgress, setScrollProgress] = useState(1);

	const previousScrollTop = useRef(0);
	const previouslyFixed = useRef(true);
	const previouslyScrollingUp = useRef(false);
	const directionChangeScrollTop = useRef(0);
	const progressAtDirectionChange = useRef(1);
	const suppressed = useRef(false);
	const suppressQuietMs = useRef(300);
	const suppressTimeout = useRef<number | undefined>(undefined);

	const pause = useCallback((quietMs = 300) => {
		suppressed.current = true;
		suppressQuietMs.current = quietMs;
		window.clearTimeout(suppressTimeout.current);
		suppressTimeout.current = window.setTimeout(() => {
			suppressed.current = false;
		}, quietMs);
	}, []);

	useEffect(() => {
		if (!element) return;

		// Restarts tracking from wherever the jump ends, hidden unless it ends within `fixedAt`.
		let hiding = false;
		let hideTimeout: number | undefined;
		const settleHidden = () => {
			const { scrollTop } = element;
			const fixed = scrollTop <= fixedAt;
			previousScrollTop.current = scrollTop;
			previouslyFixed.current = fixed;
			previouslyScrollingUp.current = false;
			directionChangeScrollTop.current = scrollTop;
			progressAtDirectionChange.current = fixed ? 1 : 0;
			setScrollProgress(fixed ? 1 : 0);
		};
		const stopHidingAfter = (ms: number) => {
			window.clearTimeout(hideTimeout);
			hideTimeout = window.setTimeout(() => {
				hiding = false;
			}, ms);
		};
		const onHide = () => {
			hiding = true;
			settleHidden();
			stopHidingAfter(HIDE_SCROLL_WAIT_MS);
		};

		const onScroll = () => {
			// Checked before `suppressed`, so a zoom's pause can't swallow the jump's scroll.
			if (hiding) {
				settleHidden();
				stopHidingAfter(HIDE_QUIET_MS);
				return;
			}
			// Skip programmatic scrolls (resize, or `pause` from a caller),
			// resyncing so the next real scroll's delta starts from here.
			if (suppressed.current) {
				window.clearTimeout(suppressTimeout.current);
				suppressTimeout.current = window.setTimeout(() => {
					suppressed.current = false;
				}, suppressQuietMs.current);
				previousScrollTop.current = element.scrollTop;
				return;
			}

			const { scrollTop } = element;
			const scrollingUp = scrollTop < previousScrollTop.current;
			previousScrollTop.current = scrollTop;

			const fixed = scrollTop <= fixedAt;

			if (previouslyFixed.current !== fixed) {
				previouslyFixed.current = fixed;
				previouslyScrollingUp.current = scrollingUp;
				directionChangeScrollTop.current = fixed ? scrollTop : fixedAt;
				progressAtDirectionChange.current = 1;
			} else if (
				!fixed &&
				previouslyScrollingUp.current !== scrollingUp
			) {
				progressAtDirectionChange.current = progressAt(
					scrollTop,
					previouslyScrollingUp.current,
					directionChangeScrollTop.current,
					progressAtDirectionChange.current,
					scrollDistance,
				);
				previouslyScrollingUp.current = scrollingUp;
				directionChangeScrollTop.current = scrollTop;
			}

			setScrollProgress(
				fixed
					? 1
					: progressAt(
							scrollTop,
							scrollingUp,
							directionChangeScrollTop.current,
							progressAtDirectionChange.current,
							scrollDistance,
						),
			);
		};

		const onResize = () => pause(300);

		onScroll();
		element.addEventListener("scroll", onScroll, { passive: true });
		element.addEventListener(HEADROOM_HIDE_EVENT, onHide);
		window.addEventListener("resize", onResize);

		return () => {
			element.removeEventListener("scroll", onScroll);
			element.removeEventListener(HEADROOM_HIDE_EVENT, onHide);
			window.removeEventListener("resize", onResize);
			window.clearTimeout(hideTimeout);
		};
	}, [element, fixedAt, scrollDistance, pause]);

	// While there is no scroller yet nothing can be scrolled away, so the
	// chrome reads as fully revealed regardless of the last known progress.
	const progress = element ? scrollProgress : 1;

	return { pinned: progress > 0, scrollProgress: progress, pause };
}

/** Progress reached after scrolling from `origin` to `scrollTop`, clamped to 0..1. */
function progressAt(
	scrollTop: number,
	scrollingUp: boolean,
	origin: number,
	progressAtOrigin: number,
	scrollDistance: number,
) {
	const traveled = Math.abs(scrollTop - origin) / scrollDistance;

	return scrollingUp
		? Math.min(progressAtOrigin + traveled, 1)
		: Math.max(progressAtOrigin - traveled, 0);
}
