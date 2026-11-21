/** How many decimals every priority percentile in the UI is shown with. */
export const PRIORITY_PERCENTILE_DECIMALS = 2;

/**
 * A priority's percentile as shown (e.g. "42.50%"), always with the same decimals
 * so a value never appears in two formats.
 */
export function formatPriorityPercentile(percentile: number): string {
	return `${percentile.toFixed(PRIORITY_PERCENTILE_DECIMALS)}%`;
}

/**
 * A priority percentile range as it is shown to the user, e.g. "70.00–100.00%",
 * with the percent sign carried by the upper bound only.
 */
export function formatPriorityPercentileRange(
	min: number,
	max: number,
): string {
	return `${min.toFixed(PRIORITY_PERCENTILE_DECIMALS)}–${formatPriorityPercentile(max)}`;
}
