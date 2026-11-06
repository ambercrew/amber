import { useLayoutEffect, useState } from "react";

/**
 * The scroll area around `root`, and how far down it `root` starts, as a
 * virtualized list there needs: the area can scroll content above the list too.
 */
export function useVirtualListScroll(root: HTMLElement | null) {
	const viewport =
		root?.closest<HTMLElement>("[data-scrollarea-viewport]") ?? null;
	const [scrollMargin, setScrollMargin] = useState(0);

	useLayoutEffect(() => {
		if (!root || !viewport) return;
		const measure = () =>
			setScrollMargin(
				root.getBoundingClientRect().top -
					viewport.getBoundingClientRect().top +
					viewport.scrollTop,
			);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(viewport.firstElementChild ?? viewport);
		return () => observer.disconnect();
	}, [root, viewport]);

	return { viewport, scrollMargin };
}
