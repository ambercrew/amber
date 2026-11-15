import { normalize } from "../normalize";
import { deriveTitle } from "../deriveTitle";
import { createImportedLearningAsset } from "../createImportedLearningAsset";
import { ImportContext } from "../importContext";
import { textToParagraphs } from "../text/extract";
import { ElementId } from "../../../types/elements/elementId";

export interface PastedContent {
	html: string | null;
	text: string;
}

export async function runContentImport(
	input: PastedContent,
	ctx: ImportContext,
): Promise<ElementId> {
	const html = input.html ?? textToParagraphs(input.text);
	const content = await normalize(html, { baseUrl: null });
	const title = deriveTitle(content, input.text);

	const id = await createImportedLearningAsset(ctx, title, content);
	return { type: "learningAsset", id };
}
