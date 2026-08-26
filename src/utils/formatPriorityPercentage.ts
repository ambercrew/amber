/** How many decimals every priority percentage in the UI is shown with. */
export const PRIORITY_PERCENTAGE_DECIMALS = 2;

/**
 * A priority as it is shown to the user, e.g. "42.50%". Priorities are always
 * displayed with the same number of decimals so the same value never appears
 * in two different formats across the UI.
 */
export function formatPriorityPercentage(percentage: number): string {
	return `${percentage.toFixed(PRIORITY_PERCENTAGE_DECIMALS)}%`;
}

/**
 * A priority range as it is shown to the user, e.g. "70.00–100.00%", with the
 * percent sign carried by the upper bound only.
 */
export function formatPriorityPercentageRange(
	min: number,
	max: number,
): string {
	return `${min.toFixed(PRIORITY_PERCENTAGE_DECIMALS)}–${formatPriorityPercentage(max)}`;
}
