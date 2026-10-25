import {
	LEARNING_ASSET_ESTIMATE_CHAR_AREA_IN_PX,
	LEARNING_ASSET_SPLIT_MIN_HEIGHT_IN_PX,
} from "../learningAssetViewConstants";

/**
 * Rough height (px) for a split we haven't measured yet, from its stored content
 * length. Taller when there is more content; shorter when the column is wider
 * (more characters fit per line). This is only a first-paint placeholder — a
 * `ResizeObserver` replaces it with the real height once the split mounts.
 */
export function estimateSplitHeight(
	charCount: number,
	contentWidth: number,
): number {
	const width = contentWidth > 0 ? contentWidth : 1;
	const raw = (charCount * LEARNING_ASSET_ESTIMATE_CHAR_AREA_IN_PX) / width;
	return Math.max(LEARNING_ASSET_SPLIT_MIN_HEIGHT_IN_PX, Math.round(raw));
}
