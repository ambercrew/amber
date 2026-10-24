import { LearningAssetPlugin } from "../types";
import SearchProvider from "./SearchProvider";
import SearchSplitPlugin from "./SearchSplitPlugin";

/** Find-in-page across the whole learning asset, including splits that aren't mounted. */
export const searchPlugin: LearningAssetPlugin = {
	id: "search",
	Provider: SearchProvider,
	SplitPlugin: SearchSplitPlugin,
};
