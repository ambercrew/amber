import { useCallback, useState } from "react";

// Round to reduce cache churn from sub-pixel / scrollbar variance.
const roundWidth = (width: number) => Math.round(width / 10) * 10;

/**
 * Tracks a node's rounded `clientWidth` via a `ResizeObserver`, so window
 * resizes, panel toggles and line width changes all update it.
 */
export function useContentWidth() {
	const [contentWidth, setContentWidth] = useState(0);
	// A callback ref so measuring starts whenever the node attaches, even if
	// it first renders after a loading state.
	const ref = useCallback((node: HTMLElement | null) => {
		if (!node) return;
		const measure = () => setContentWidth(roundWidth(node.clientWidth));
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return [contentWidth, ref] as const;
}
