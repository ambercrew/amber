import { ComponentType, PropsWithChildren } from "react";

/**
 * A self-contained learning asset feature (read point, marks, search, …),
 * built on `useReaderCore()`. Every part is optional.
 */
export interface LearningAssetPlugin {
	id: string;
	/** Runs the plugin's view-wide hooks and shares their state with its other parts. Nested in list order. */
	Provider?: ComponentType<PropsWithChildren>;
	/** Rendered inside every mounted split's Lexical editor; reads its seq from `useSplit()`. */
	SplitPlugin?: ComponentType;
	/** Items added to a split's right-click menu. */
	ContextMenuItems?: ComponentType;
	/** Rendered once, beside the split stack. */
	Overlay?: ComponentType;
}
