export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;

/** Step used by the Ctrl+/- shortcuts and Ctrl+wheel zoom. */
export const ZOOM_STEP = 10;

export function clampZoom(value: number): number {
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}
