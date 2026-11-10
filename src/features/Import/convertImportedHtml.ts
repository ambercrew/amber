import ConvertImportedHtmlEventDto, {
	ConvertImportedHtmlResponseDto,
} from "../../api/import/events/convertImportedHtmlEvent";
import { domToLexicalJson } from "../../components/Editor/lexicalJsonConversion";
import { applyCardStyles } from "./anki/applyCardStyles";
import { divsToParagraphs } from "./anki/divsToParagraphs";
import { removeHiddenElements } from "./anki/removeHiddenElements";
import { memoizeLocalizeImages } from "./images/memoizeLocalizeImages";
import { normalizeDocument } from "./normalize";

/** Answers the backend's request to convert imported HTML, e.g. an Anki package's cards. */
export async function convertImportedHtml({
	htmls,
}: ConvertImportedHtmlEventDto): Promise<ConvertImportedHtmlResponseDto> {
	try {
		// A deck's template repeats the same images on every card.
		const localizeImages = memoizeLocalizeImages();
		const parser = new DOMParser();
		// One at a time, so a large deck doesn't fetch every remote image at once.
		const contents = [];
		for (const html of htmls) {
			// Each step edits the same document, as parsing a card's template CSS and scripts dominates.
			const doc = parser.parseFromString(html, "text/html");
			applyCardStyles(doc);
			removeHiddenElements(doc);
			divsToParagraphs(doc);
			const body = await normalizeDocument(doc, {
				baseUrl: null,
				localizeImages,
			});
			contents.push(domToLexicalJson(body));
		}
		return { contents };
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
