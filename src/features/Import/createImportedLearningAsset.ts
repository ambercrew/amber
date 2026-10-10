import { htmlToLexicalJson } from "../../components/Editor/lexicalJsonConversion";
import { createLearningAssetAction } from "../../stores/elements/elementsActions";
import { ImportContext } from "./importContext";
import { splitContent } from "./splitContent";

/** Creates the learning asset and returns its id; the caller decides whether to open it. */
export async function createImportedLearningAsset(
	ctx: ImportContext,
	name: string,
	content: string,
	bibliographicalSourceId?: string | null,
): Promise<string> {
	const id = crypto.randomUUID();
	await ctx.dispatch(
		createLearningAssetAction({
			id,
			meta: {
				name,
				parent: ctx.parent,
				origin: { type: "custom", bibliographicalSourceId },
			},
			type: "extracted",
			splits: splitContent(content).map(html => htmlToLexicalJson(html)),
			initialPriorityPosition: ctx.priorityPosition,
		}),
	);
	return id;
}
