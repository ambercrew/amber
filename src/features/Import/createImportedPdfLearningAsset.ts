import { paths } from "../../paths";
import { createLearningAssetAction } from "../../stores/elements/elementsActions";
import { ImportContext } from "./importContext";

export async function createImportedPdfLearningAsset(
	ctx: ImportContext,
	name: string,
	pdfBytesBase64: string,
	pdfPageCount: number,
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
			type: "pdf",
			pdfBytesBase64,
			pdfPageCount,
			splits: [],
			initialPriorityRank: ctx.priorityRank,
		}),
	);
	await ctx.navigate(paths.element("learningAsset", id));
}
