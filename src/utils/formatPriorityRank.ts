/** How many decimals every priority rank in the UI is shown with. */
export const PRIORITY_RANK_DECIMALS = 2;

/**
 * A priority's percentile-scale rank as it is shown to the user, e.g.
 * "42.50%". Priorities are always displayed with the same number of
 * decimals so the same value never appears in two different formats across
 * the UI.
 */
export function formatPriorityRank(rank: number): string {
	return `${rank.toFixed(PRIORITY_RANK_DECIMALS)}%`;
}

/**
 * A priority rank range as it is shown to the user, e.g. "70.00–100.00%",
 * with the percent sign carried by the upper bound only.
 */
export function formatPriorityRankRange(min: number, max: number): string {
	return `${min.toFixed(PRIORITY_RANK_DECIMALS)}–${formatPriorityRank(max)}`;
}
