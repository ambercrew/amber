/** What placed the read point during this opening of a learning asset. */
export type ReadPointSource = "automatic" | "extract" | "manual";

const RANK: Record<ReadPointSource, number> = {
	automatic: 0,
	extract: 1,
	manual: 2,
};

/**
 * Whether a placement from `incoming` may replace one from `current`. Manual
 * beats extract/cloze creation, which beats automatic tracking. Once a higher
 * source has placed the read point, lower ones stop until the next open.
 */
export function canPlaceReadPoint(
	incoming: ReadPointSource,
	current: ReadPointSource,
): boolean {
	return RANK[incoming] >= RANK[current];
}
