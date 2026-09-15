export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** The percentile gap between two adjacent ranks, so stepping the controls
 * moves priority by exactly one element. */
export function percentileStepFor(total: number): number {
	return total <= 1 ? 1 : 100 / (total - 1);
}

export function rankToPercentile(total: number, rank: number): number {
	return total <= 1 ? 0 : ((rank - 1) / (total - 1)) * 100;
}

export function percentileToRank(total: number, percentile: number): number {
	return total <= 1
		? 1
		: clamp(Math.round((percentile / 100) * (total - 1)) + 1, 1, total);
}
