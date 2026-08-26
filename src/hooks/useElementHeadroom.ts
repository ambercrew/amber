import { useEffect, useRef, useState } from "react";

interface Options {
	/** Scroll container to observe; stays pinned while it is null. */
	element: HTMLElement | null;
	/** How far the container must be scrolled before unpinning is allowed. */
	fixedAt: number;
}

/**
 * Element-scoped equivalent of Mantine's `useHeadroom`, which can only observe
 * the window scroller. Returns whether pinned chrome (the header, the footer)
 * should be shown: always within `fixedAt` of the top, and below that only
 * while scrolling back up.
 */
export function useElementHeadroom({ element, fixedAt }: Options) {
	const [pinned, setPinned] = useState(true);
	const previousScrollTop = useRef(0);

	useEffect(() => {
		if (!element) return;

		const onScroll = () => {
			const { scrollTop } = element;
			const previous = previousScrollTop.current;
			previousScrollTop.current = scrollTop;
			setPinned(scrollTop <= fixedAt || scrollTop < previous);
		};

		onScroll();
		element.addEventListener("scroll", onScroll, { passive: true });

		return () => element.removeEventListener("scroll", onScroll);
	}, [element, fixedAt]);

	return pinned;
}
