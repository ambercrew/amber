/** The media query separating touch input from a mouse/trackpad. */
export const COARSE_POINTER_QUERY = "(pointer: coarse)";

/** Matches when any pointer is touch, even while a mouse or trackpad is the primary one. */
export const ANY_COARSE_POINTER_QUERY = "(any-pointer: coarse)";

/**
 * Whether the primary pointer is coarse, for code outside React (e.g. a command's
 * `enabled`) that can't use `useIsCoarsePointer`.
 */
export function isCoarsePointer(): boolean {
	return window.matchMedia?.(COARSE_POINTER_QUERY).matches ?? false;
}
