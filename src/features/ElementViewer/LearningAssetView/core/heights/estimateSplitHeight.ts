import {
	LEARNING_ASSET_ESTIMATE_CHAR_AREA_IN_PX,
	LEARNING_ASSET_SPLIT_MIN_HEIGHT_IN_PX,
} from "../learningAssetViewConstants";

/**
 * A first-paint height (px) for an unmeasured split from its content length and the column's width,
 * until a `ResizeObserver` measures it once mounted.
 */
export function estimateSplitHeight(
	charCount: number,
	contentWidth: number,
): number {
	const width = contentWidth > 0 ? contentWidth : 1;
	const raw = (charCount * LEARNING_ASSET_ESTIMATE_CHAR_AREA_IN_PX) / width;
	return Math.max(LEARNING_ASSET_SPLIT_MIN_HEIGHT_IN_PX, Math.round(raw));
}
