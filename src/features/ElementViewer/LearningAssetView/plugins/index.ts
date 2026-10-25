import { marksPlugin } from "./marks";
import { readPointPlugin } from "./readPoint";
import { searchPlugin } from "./search";
import { tableOfContentsPlugin } from "./tableOfContents";
import { LearningAssetPlugin } from "./types";

/** Every learning asset plugin, in nesting order: a plugin may read the contexts of those before it. */
export const learningAssetPlugins: LearningAssetPlugin[] = [
	readPointPlugin,
	marksPlugin,
	searchPlugin,
	tableOfContentsPlugin,
];
