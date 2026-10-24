import { LearningAssetPlugin } from "../types";
import TableOfContentsProvider from "./TableOfContentsProvider";
import TableOfContentsSplitPlugin from "./TableOfContentsSplitPlugin";

/** Lists the learning asset's headings, mounted or not, in the side panel's table of contents. */
export const tableOfContentsPlugin: LearningAssetPlugin = {
	id: "tableOfContents",
	Provider: TableOfContentsProvider,
	SplitPlugin: TableOfContentsSplitPlugin,
};
