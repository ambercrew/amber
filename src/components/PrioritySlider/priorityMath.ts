export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** The percentage gap between two adjacent ranks, so stepping the controls
 * moves priority by exactly one element. */
export function percentageStepFor(total: number): number {
	return total <= 1 ? 1 : 100 / total;
}

export function rankToPercentage(total: number, rank: number): number {
	return total <= 1 ? 0 : (rank / total) * 100;
}

export function percentageToRank(total: number, percentage: number): number {
	return total <= 1
		? 1
		: clamp(Math.round((percentage / 100) * total), 1, total);
}
