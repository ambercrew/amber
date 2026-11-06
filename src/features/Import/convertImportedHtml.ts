import ConvertImportedHtmlEventDto, {
	ConvertImportedHtmlResponseDto,
} from "../../api/import/events/convertImportedHtmlEvent";
import { htmlToLexicalJson } from "../../components/Editor/lexicalJsonConversion";
import { applyCardStyles } from "./anki/applyCardStyles";
import { divsToParagraphs } from "./anki/divsToParagraphs";
import { removeHiddenElements } from "./anki/removeHiddenElements";
import { memoizeLocalizeImages } from "./images/memoizeLocalizeImages";
import { normalize } from "./normalize";

/** Answers the backend's request to convert imported HTML, e.g. an Anki package's cards. */
export async function convertImportedHtml({
	htmls,
}: ConvertImportedHtmlEventDto): Promise<ConvertImportedHtmlResponseDto> {
	try {
		// A deck's template repeats the same images on every card.
		const localizeImages = memoizeLocalizeImages();
		// One at a time, so a large deck doesn't fetch every remote image at once.
		const contents = [];
		for (const html of htmls) {
			const visible = divsToParagraphs(
				removeHiddenElements(applyCardStyles(html)),
			);
			const normalized = await normalize(visible, {
				baseUrl: null,
				localizeImages,
			});
			contents.push(htmlToLexicalJson(normalized));
		}
		return { contents };
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
