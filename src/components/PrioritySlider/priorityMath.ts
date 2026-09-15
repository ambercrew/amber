export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** The percentile gap between two adjacent positions, so stepping the controls
 * moves priority by exactly one element. */
export function percentileStepFor(total: number): number {
	return total <= 1 ? 1 : 100 / (total - 1);
}

export function positionToPercentile(total: number, position: number): number {
	// Multiply before dividing so whole-number percentiles stay exact.
	return total <= 1 ? 0 : ((position - 1) * 100) / (total - 1);
}

export function percentileToPosition(
	total: number,
	percentile: number,
): number {
	return total <= 1
		? 1
		: clamp(Math.round((percentile * (total - 1)) / 100) + 1, 1, total);
}
