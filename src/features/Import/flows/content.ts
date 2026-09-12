import { normalize } from "../normalize";
import { deriveTitle } from "../deriveTitle";
import { createImportedLearningAsset } from "../createImportedLearningAsset";
import { ImportContext } from "../importContext";
import { escapeHtml } from "../../../utils/escapeHtml";

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

	await createImportedLearningAsset(ctx, title, content);
}

function textToParagraphs(text: string): string {
	return text
		.split(/\n{2,}/)
		.map(paragraph => `<p>${escapeHtml(paragraph.trim())}</p>`)
		.join("");
}
