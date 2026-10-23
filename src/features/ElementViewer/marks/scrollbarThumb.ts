// Mirrors Mantine ScrollArea's thumb math (`getThumbSize`, `getThumbOffsetFromScroll`), so ticks line up with its thumb.
const MIN_THUMB_SIZE_IN_PX = 18;

export interface ScrollbarGeometry {
	scrollHeight: number;
	clientHeight: number;
	/** The scrollbar's full height, padding included. */
	trackHeight: number;
	/** Padding at each end of the scrollbar. */
	padding: number;
}

/** Where the thumb's top sits when scrolled to `scrollTop`, as a fraction (0 to 1) of the scrollbar's height. */
export function thumbTopFraction(
	scrollTop: number,
	{ scrollHeight, clientHeight, trackHeight, padding }: ScrollbarGeometry,
): number {
	const maxScrollTop = scrollHeight - clientHeight;
	if (trackHeight <= 0 || maxScrollTop <= 0) return 0;
	const track = trackHeight - 2 * padding;
	const thumb = Math.max(
		(track * clientHeight) / scrollHeight,
		MIN_THUMB_SIZE_IN_PX,
	);
	const clamped = Math.min(Math.max(scrollTop, 0), maxScrollTop);
	return (padding + (clamped / maxScrollTop) * (track - thumb)) / trackHeight;
}

/** The padding Mantine gives a ScrollArea scrollbar: a fifth of its size, truncated as Mantine measures it. */
export function scrollAreaScrollbarPadding(viewport: Element): number {
	const size = parseFloat(
		getComputedStyle(viewport).getPropertyValue(
			"--scrollarea-scrollbar-size",
		),
	);
	return Number.isNaN(size) ? 0 : Math.trunc(size / 5);
}
