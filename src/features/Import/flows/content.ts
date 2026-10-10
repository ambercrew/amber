import { paths } from "../../../paths";
import { normalize } from "../normalize";
import { deriveTitle } from "../deriveTitle";
import { createImportedLearningAsset } from "../createImportedLearningAsset";
import { ImportContext } from "../importContext";
import { textToParagraphs } from "../text/extract";

export interface PastedContent {
	html: string | null;
	text: string;
}

export async function runContentImport(
	input: PastedContent,
	ctx: ImportContext,
): Promise<void> {
	const html = input.html ?? textToParagraphs(input.text);
	const content = await normalize(html, { baseUrl: null });
	const title = deriveTitle(content, input.text);

	const id = await createImportedLearningAsset(ctx, title, content);
	await ctx.navigate(paths.element("learningAsset", id));
}
