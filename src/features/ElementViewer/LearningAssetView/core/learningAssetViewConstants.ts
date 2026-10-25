import { HEADER_AND_FOOTER_HEIGHT } from "../../../App/components/App";

// Splits kept mounted on each side of the primary split. Live editors ≈ 2 * NEIGHBORS + 1.
export const LEARNING_ASSET_SPLIT_MOUNT_NEIGHBORS = 1;
// Floor for any placeholder height so empty/near-empty splits stay observable.
export const LEARNING_ASSET_SPLIT_MIN_HEIGHT_IN_PX = 120;
// Rough px² per content character, for sizing not-yet-measured placeholders:
// height ≈ charCount * AREA / width. Replaced by the real height once mounted.
export const LEARNING_ASSET_ESTIMATE_CHAR_AREA_IN_PX = 200;
// One localStorage write per settle, not per ResizeObserver tick.
export const LEARNING_ASSET_HEIGHT_WRITE_DEBOUNCE_IN_MILLISECONDS = 400;
// Height of the fixed app header, offsetting where the viewport top actually is.
export const LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX =
	HEADER_AND_FOOTER_HEIGHT;
