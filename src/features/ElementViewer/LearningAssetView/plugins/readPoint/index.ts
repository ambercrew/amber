import ReadPointMenu from "../../../../../components/Editor/plugins/ReadPointMenu";
import { LearningAssetPlugin } from "../types";
import ExtractReadPointPlugin from "./ExtractReadPointPlugin";
import ReadPointProvider from "./ReadPointProvider";

/** Tracks and restores where the reader left off. Its marker and tick are drawn by the marks plugin, beside the marks. */
export const readPointPlugin: LearningAssetPlugin = {
	id: "read-point",
	Provider: ReadPointProvider,
	SplitPlugin: ExtractReadPointPlugin,
	ContextMenuItems: ReadPointMenu,
};
