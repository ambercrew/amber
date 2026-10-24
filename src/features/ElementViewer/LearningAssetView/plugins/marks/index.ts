import MarksMenuRow from "../../../marks/MarksMenuRow";
import { LearningAssetPlugin } from "../types";
import MarksGutter from "./MarksGutter";
import MarksProvider from "./MarksProvider";
import MarksScrollbarOverlay from "./MarksScrollbarOverlay";

/** Up to three marks to set and jump back to. Also draws the read point beside them, so it must come after `readPointPlugin`. */
export const marksPlugin: LearningAssetPlugin = {
	id: "marks",
	Provider: MarksProvider,
	SplitPlugin: MarksGutter,
	ContextMenuItems: MarksMenuRow,
	// Above the read point items, as in the PDF view.
	contextMenuOrder: -1,
	Overlay: MarksScrollbarOverlay,
};
