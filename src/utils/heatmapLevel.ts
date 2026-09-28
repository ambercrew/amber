/** Index into `levelCount` color shades for `value`, scaled so `max` gets the darkest. */
export function heatmapLevel(
	value: number,
	max: number,
	levelCount: number,
): number {
	if (max <= 0) return 0;
	const level = Math.ceil((value / max) * levelCount) - 1;
	return Math.min(levelCount - 1, Math.max(0, level));
}
