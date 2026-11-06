import { useLayoutEffect, useState } from "react";

/**
 * The sidebar's scroll area around `root`, and how far down it `root` starts, as
 * a virtualized list there needs: the panel can scroll content above the list too.
 */
export function useSidebarScroll(root: HTMLElement | null) {
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
