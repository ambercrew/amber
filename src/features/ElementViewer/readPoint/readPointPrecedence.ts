import { ReadPointSource } from "../../../types/elements/readPointSource";

const RANK: Record<ReadPointSource, number> = {
	automatic: 0,
	extract: 1,
	lookup: 2,
	manual: 3,
};

/**
 * Whether a placement from `incoming` may replace one from `current`: manual beats an open at a spot, which
 * beats extract or cloze creation, which beats tracking, and lower sources stop until the next open.
 */
export function canPlaceReadPoint(
	incoming: ReadPointSource,
	current: ReadPointSource,
): boolean {
	return RANK[incoming] >= RANK[current];
}
