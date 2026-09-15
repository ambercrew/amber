/** How many decimals every priority percentile in the UI is shown with. */
export const PRIORITY_PERCENTILE_DECIMALS = 2;

/**
 * A priority's percentile rank as it is shown to the user, e.g. "42.50%".
 * Priorities are always displayed with the same number of decimals so the
 * same value never appears in two different formats across the UI.
 */
export function formatPriorityPercentile(percentile: number): string {
	return `${percentile.toFixed(PRIORITY_PERCENTILE_DECIMALS)}%`;
}

/**
 * A priority percentile range as it is shown to the user, e.g.
 * "70.00–100.00%", with the percent sign carried by the upper bound only.
 */
export function formatPriorityPercentileRange(
	min: number,
	max: number,
): string {
	return `${min.toFixed(PRIORITY_PERCENTILE_DECIMALS)}–${formatPriorityPercentile(max)}`;
}
