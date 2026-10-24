/**
 * Per-learning asset cache of measured split heights in localStorage, so that the very
 * first paint of a learning asset is already close to its final layout (no scroll jump
 * as neighbours mount).
 */

const KEY_PREFIX = "splitHeights.";

function keyFor(learningAssetId: string): string {
	return `${KEY_PREFIX}${learningAssetId}`;
}

/** Loads cached heights for a learning asset, or an empty map if none are stored. */
export function loadSplitHeights(
	learningAssetId: string,
): Record<number, number> {
	try {
		const raw = localStorage.getItem(keyFor(learningAssetId));
		if (!raw) return {};
		return JSON.parse(raw) as Record<number, number>;
	} catch {
		return {};
	}
}

export function saveSplitHeights(
	learningAssetId: string,
	heights: Record<number, number>,
): void {
	try {
		localStorage.setItem(keyFor(learningAssetId), JSON.stringify(heights));
	} catch {
		// Ignore quota / serialization failures — heights are a cache, not
		// source of truth, and will simply be re-measured next session.
	}
}

/** Deletes the whole cache entry for a learning asset (e.g. when it is deleted). */
export function clearSplitHeights(learningAssetId: string): void {
	try {
		localStorage.removeItem(keyFor(learningAssetId));
	} catch {
		// Ignore.
	}
}
