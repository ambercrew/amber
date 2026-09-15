export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** The rank gap between two adjacent positions, so stepping the controls
 * moves priority by exactly one element. */
export function rankStepFor(total: number): number {
	return total <= 1 ? 1 : 100 / (total - 1);
}

export function positionToRank(total: number, position: number): number {
	return total <= 1 ? 0 : ((position - 1) / (total - 1)) * 100;
}

export function rankToPosition(total: number, rank: number): number {
	return total <= 1
		? 1
		: clamp(Math.round((rank / 100) * (total - 1)) + 1, 1, total);
}
