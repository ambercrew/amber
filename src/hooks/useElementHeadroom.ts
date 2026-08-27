import { useEffect, useRef, useState } from "react";

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
	scrollDistance = 100,
}: UseElementHeadroomInput): UseElementHeadroomReturnValue {
	const [scrollProgress, setScrollProgress] = useState(1);

	const previousScrollTop = useRef(0);
	const previouslyFixed = useRef(true);
	const previouslyScrollingUp = useRef(false);
	const directionChangeScrollTop = useRef(0);
	const progressAtDirectionChange = useRef(1);
	const resizing = useRef(false);
	const resizeTimeout = useRef<number | undefined>(undefined);

	useEffect(() => {
		if (!element) return;

		const onScroll = () => {
			// Mobile browsers scroll the container while the viewport resizes
			// (address bar, keyboard); that must not read as a real gesture.
			if (resizing.current) return;

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

		const onResize = () => {
			resizing.current = true;
			window.clearTimeout(resizeTimeout.current);
			resizeTimeout.current = window.setTimeout(() => {
				resizing.current = false;
			}, 300);
		};

		onScroll();
		element.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onResize);

		return () => {
			element.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onResize);
			window.clearTimeout(resizeTimeout.current);
		};
	}, [element, fixedAt, scrollDistance]);

	// While there is no scroller yet nothing can be scrolled away, so the
	// chrome reads as fully revealed regardless of the last known progress.
	const progress = element ? scrollProgress : 1;

	return { pinned: progress > 0, scrollProgress: progress };
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
