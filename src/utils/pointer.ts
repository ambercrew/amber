/** The media query separating touch input from a mouse/trackpad. */
export const COARSE_POINTER_QUERY = "(pointer: coarse)";

/** Whether the primary pointer is touch (coarse), for the places that can't
 * use `useIsCoarsePointer` because they aren't React components (e.g. a
 * command's `enabled` predicate). */
export function isCoarsePointer(): boolean {
	return window.matchMedia?.(COARSE_POINTER_QUERY).matches ?? false;
}
