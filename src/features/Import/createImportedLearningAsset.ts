import { htmlToLexicalJson } from "../../components/Editor/lexicalJsonConversion";
import { paths } from "../../paths";
import { createLearningAssetAction } from "../../stores/elements/elementsActions";
import { ImportContext } from "./importContext";
import { splitContent } from "./splitContent";

export async function createImportedLearningAsset(
	ctx: ImportContext,
	name: string,
	content: string,
	bibliographicalSourceId?: string | null,
): Promise<void> {
	const id = crypto.randomUUID();
	await ctx.dispatch(
		createLearningAssetAction({
			id,
			meta: {
				name,
				parent: ctx.parent,
				origin: { type: "custom", bibliographicalSourceId },
			},
			splits: splitContent(content).map(html => htmlToLexicalJson(html)),
			initialPriorityRank: ctx.priorityRank,
		}),
	);
	await ctx.navigate(paths.element("learningAsset", id));
}
